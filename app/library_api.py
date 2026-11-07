"""Read-only, explicitly published local captures for the drawing workspace."""
import json
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

def library_root():
    from app.server import DATA
    return DATA / 'library'

@router.get('/api/library')
def library():
    result = []
    for manifest in sorted(library_root().glob('*/manifest.json')):
        if not re.fullmatch(r'[a-z0-9-]{1,80}', manifest.parent.name):
            continue
        if not (manifest.parent / 'scene.ply').is_file():
            continue
        try:
            record = json.loads(manifest.read_text(encoding='utf-8'))
            record.update(id=manifest.parent.name, url=f'/api/library/{manifest.parent.name}/scene.ply')
            result.append(record)
        except (ValueError, OSError):
            continue
    return result

@router.get('/api/library/{capture_id}/{asset}')
def capture_asset(capture_id: str, asset: str):
    if not re.fullmatch(r'[a-z0-9-]{1,80}', capture_id) or asset not in ('scene.ply', 'manifest.json'):
        raise HTTPException(404, 'Unknown capture asset')
    path = library_root() / capture_id / asset
    if not path.is_file():
        raise HTTPException(404, 'Capture is not available')
    return FileResponse(path)

@router.get('/api/reconstruction-tools')
def reconstruction_tools():
    from app.server import ROOT
    import shutil
    return {'spirula': (ROOT / 'vendor/spirula/spirula.exe').is_file(),
            'ffmpeg': bool(shutil.which('ffmpeg')), 'workflow': 'align-train-publish',
            'command': './.venv/Scripts/python.exe scripts/reconstruct.py'}
