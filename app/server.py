"""Local, single-worker reconstruction service. Run through scripts/start.ps1."""
import io
import json
import os
import re
import subprocess
import sys
import threading
import time
import uuid
import hashlib
import math
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from app.catalog import MODELS, python_for, available

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get('SPLAT_DATA', ROOT / 'data')).resolve()
JOBS = DATA / 'jobs'
JOBS.mkdir(parents=True, exist_ok=True)
LOCK = threading.RLock()
POOL = ThreadPoolExecutor(max_workers=1)
LIMIT = 25 * 1024 * 1024

def folder(job_id):
    if not re.fullmatch(r'[0-9a-f]{32}', job_id):
        raise HTTPException(404, 'Unknown job')
    path = JOBS / job_id
    if not (path / 'job.json').exists():
        raise HTTPException(404, 'Unknown job')
    return path

def read_job(path):
    with LOCK:
        return json.loads((path / 'job.json').read_text())

def update(path, **fields):
    with LOCK:
        state = read_job(path) if (path / 'job.json').exists() else {}
        state.update(fields)
        temp = path / 'job.tmp'
        temp.write_text(json.dumps(state, indent=2))
        temp.replace(path / 'job.json')
    return state

def run_job(path):
    update(path, status='running', message='Loading model and reconstructing on CUDA…')
    started = time.time()
    try:
        env = os.environ.copy()
        env['TORCH_HOME'] = str(DATA / 'models')
        env['PYTHONUNBUFFERED'] = '1'
        model = read_job(path).get('model', 'sharp')
        worker = ('app.multiview_worker' if read_job(path).get('mode') == 'multiview'
                  else 'app.worker' if model == 'sharp' else 'app.alternative_worker')
        with (path / 'run.log').open('w') as log:
            result = subprocess.run([str(python_for(model)), '-m', worker, str(path)],
                                    cwd=ROOT, env=env, stdout=log, stderr=log, timeout=1800)
        if result.returncode:
            raise RuntimeError((path / 'run.log').read_text(errors='replace')[-3000:])
        if not (path / 'scene.ply').exists():
            raise RuntimeError('Inference finished without a scene file.')
        meta = json.loads((path / 'scene.json').read_text())
        update(path, status='complete', message='Scene ready', seconds=round(time.time()-started, 2), scene=meta)
    except Exception as exc:
        update(path, status='failed', message=str(exc)[-3000:])

@asynccontextmanager
async def lifespan(app):
    for path in JOBS.iterdir():
        if path.is_dir() and (path / 'job.json').exists():
            if read_job(path)['status'] in ('queued', 'running'):
                update(path, status='failed', message='Server restarted. Upload again to retry.')
    yield
    POOL.shutdown(wait=True)

app = FastAPI(title='Architecture Splat Studio', lifespan=lifespan)

@app.middleware('http')
async def local_requests(request: Request, call_next):
    # Reject cross-origin uploads, including browser requests from remote sites.
    origin = request.headers.get('origin')
    if request.method == 'POST' and (DATA / 'reconstruction.lock').exists():
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': 'Photogrammetry is using the GPU. Wait for it to finish.'}, status_code=409)
    if request.method == 'POST' and origin and origin != str(request.base_url).rstrip('/'):
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': 'Cross-origin uploads are disabled'}, status_code=403)
    return await call_next(request)

@app.get('/api/health')
def health():
    import torch
    import importlib.util
    return {'cuda': torch.cuda.is_available(),
            'gpu': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            'torch': torch.__version__, 'sharp': importlib.util.find_spec('sharp') is not None,
            'checkpoint': (DATA / 'models/hub/checkpoints/sharp_2572gikvuh.pt').exists()}

@app.get('/api/jobs')
def jobs():
    return sorted([read_job(p.parent) for p in JOBS.glob('*/job.json')],
                  key=lambda j: j['created'], reverse=True)

@app.get('/api/models')
def models():
    return [dict(id=k, **v, available=available(k)) for k,v in MODELS.items()]

def parse_settings(request):
    selected = request.query_params.get('models', request.query_params.get('model', 'sharp')).split(',')
    if not selected or len(selected) > 3 or len(set(selected)) != len(selected) or any(m not in MODELS for m in selected):
        raise HTTPException(400, 'Choose 1-3 different supported models')
    for m in selected:
        if not available(m):
            raise HTTPException(503, f'{m} is not installed; run scripts/setup-models.ps1')
    focal = request.query_params.get('focal_mm')
    try:
        focal = float(focal) if focal else None
        if focal is not None and (not math.isfinite(focal) or not 10 <= focal <= 200):
            raise ValueError()
    except ValueError:
        raise HTTPException(400, 'Focal length must be 10-200mm (35mm equivalent)')
    return selected, focal

def enqueue(content, suffix, selected, focal):
    with LOCK:
        active = [j for j in jobs() if j['status'] in ('queued', 'running')]
        if len(active) + len(selected) > 6:
            raise HTTPException(429, 'GPU queue is full; wait for a comparison to finish')
        group = uuid.uuid4().hex
        result = []
        for model in selected:
            job_id = uuid.uuid4().hex
            path = JOBS / job_id
            path.mkdir()
            (path / ('input' + suffix)).write_bytes(content)
            result.append(update(path, id=job_id, created=time.time(), status='queued',
                message='Waiting for GPU', input='input'+suffix, model=model,
                comparison=group, source_hash=hashlib.sha256(content).hexdigest(), focal_mm=focal))
            POOL.submit(run_job, path)
        return result

@app.post('/api/jobs', status_code=202)
async def create_job(request: Request):
    selected, focal = parse_settings(request)
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > LIMIT:
            raise HTTPException(413, 'Maximum image size is 25 MB')
    try:
        with Image.open(io.BytesIO(content)) as im:
            if im.format not in ('JPEG', 'PNG', 'WEBP'):
                raise ValueError('Use JPEG, PNG, or WebP')
            if im.width * im.height > 40_000_000:
                raise ValueError('Maximum image resolution is 40 megapixels')
            im.verify()
            suffix = {'JPEG': '.jpg', 'PNG': '.png', 'WEBP': '.webp'}[im.format]
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(400, str(exc)) from exc
    result = enqueue(content, suffix, selected, focal)
    return result if 'models' in request.query_params else result[0]

@app.post('/api/jobs/{job_id}/compare', status_code=202)
def compare_existing(job_id: str, request: Request):
    selected, focal = parse_settings(request)
    path = folder(job_id)
    if read_job(path).get('mode') == 'multiview':
        raise HTTPException(400, 'Use the multi-view page to reconstruct an image set')
    source = path / read_job(path)['input']
    return enqueue(source.read_bytes(), source.suffix, selected, focal)

@app.get('/api/jobs/{job_id}')
def job(job_id: str):
    return read_job(folder(job_id))

@app.get('/api/jobs/{job_id}/{asset}')
def asset(job_id: str, asset: str):
    path = folder(job_id)
    state = read_job(path)
    allowed = {'scene.ply', 'scene.json', 'run.log', 'cameras.json', state['input']}
    allowed.update(v['file'] for v in state.get('views', []))
    if asset not in allowed or not (path / asset).is_file():
        raise HTTPException(404, 'Asset not available')
    return FileResponse(path / asset)

from app.multiview_api import router as multiview_router
app.include_router(multiview_router)
from app.library_api import router as library_router
app.include_router(library_router)

app.mount('/deps', StaticFiles(directory=ROOT / 'node_modules', check_dir=False), name='deps')
app.mount('/', StaticFiles(directory=ROOT / 'web', html=True), name='web')
