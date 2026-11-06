"""Bounded multi-image uploads. No client filenames are used as storage paths."""
import hashlib
import io
import time
import uuid

from fastapi import APIRouter, HTTPException, Request
from PIL import Image, UnidentifiedImageError
from starlette.formparsers import MultiPartException, MultiPartParser
from starlette.datastructures import UploadFile

router = APIRouter()
MAX_VIEWS = 16
MAX_TOTAL = 200 * 1024 * 1024


@router.get('/api/multiview')
def capabilities():
    from app import server
    return {'available': server.available('zipsplat'), 'max_views': MAX_VIEWS,
            'max_total_mb': MAX_TOTAL // 1024**2, 'refinement': False,
            'description': 'ZipSplat 504 jointly estimates one scene and all input cameras. '
                           'Feed-forward mode; TokenBA refinement is not enabled.'}


@router.post('/api/multiview/jobs', status_code=202)
async def create_job(request: Request):
    from app import server
    if not server.available('zipsplat'):
        raise HTTPException(503, 'Run scripts/setup-models.ps1 to install ZipSplat')
    if request.query_params:
        raise HTTPException(400, 'This endpoint uses feed-forward ZipSplat with no query options')
    if not request.headers.get('content-type', '').startswith('multipart/form-data'):
        raise HTTPException(415, 'Upload images as multipart form fields named images')
    total = 0

    async def bounded_stream():
        nonlocal total
        async for chunk in request.stream():
            total += len(chunk)
            if total > MAX_TOTAL:
                # MultiPartParser closes its temporary files on this exception.
                raise MultiPartException('Image set exceeds 200 MB')
            yield chunk

    try:
        form = await MultiPartParser(request.headers, bounded_stream(),
                                     max_files=MAX_VIEWS, max_fields=0).parse()
    except MultiPartException as exc:
        raise HTTPException(413 if total > MAX_TOTAL else 400, str(exc)) from exc
    payloads = []
    try:
        items = form.multi_items()
        if not 2 <= len(items) <= MAX_VIEWS:
            raise HTTPException(400, f'Choose 2-{MAX_VIEWS} overlapping photographs')
        hashes = set()
        for key, upload in items:
            if key != 'images' or not isinstance(upload, UploadFile):
                raise HTTPException(400, 'All fields must be image files named images')
            content = await upload.read(server.LIMIT + 1)
            if len(content) > server.LIMIT:
                raise HTTPException(413, 'Each image must be at most 25 MB')
            digest = hashlib.sha256(content).hexdigest()
            if digest in hashes:
                raise HTTPException(400, 'Duplicate images cannot provide additional viewpoints')
            hashes.add(digest)
            try:
                with Image.open(io.BytesIO(content)) as im:
                    if im.format not in ('JPEG', 'PNG', 'WEBP'):
                        raise ValueError('Use JPEG, PNG, or WebP')
                    if im.width * im.height > 40_000_000:
                        raise ValueError('Maximum image resolution is 40 megapixels')
                    suffix = {'JPEG': '.jpg', 'PNG': '.png', 'WEBP': '.webp'}[im.format]
                    im.verify()
            except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
                raise HTTPException(400, f'Invalid image: {exc}') from exc
            payloads.append((content, suffix, digest, (upload.filename or 'photo')[:200]))
    finally:
        await form.close()

    with server.LOCK:
        if sum(j['status'] in ('queued', 'running') for j in server.jobs()) >= 6:
            raise HTTPException(429, 'GPU queue is full')
        job_id = uuid.uuid4().hex
        path = server.JOBS / job_id
        path.mkdir()
        views = []
        try:
            for i, (content, suffix, digest, name) in enumerate(payloads):
                filename = f'view-{i:03d}{suffix}'
                (path / filename).write_bytes(content)
                views.append({'file': filename, 'name': name, 'sha256': digest})
            state = server.update(path, id=job_id, created=time.time(), status='queued',
                message='Waiting for GPU', model='zipsplat', mode='multiview',
                input=views[0]['file'], views=views, comparison=job_id, refinement=False)
        except Exception:
            # Only remove files just created by this request, never a user-selected path.
            for child in path.iterdir():
                child.unlink()
            path.rmdir()
            raise
        server.POOL.submit(server.run_job, path)
        return state
