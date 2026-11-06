"""Isolated inference process; exiting releases GPU memory after every job."""
import json
import logging
import math
import sys
from pathlib import Path
import numpy as np
import torch
from sharp.cli.predict import predict_image, DEFAULT_MODEL_URL
from sharp.models import create_predictor, PredictorParams
from sharp.utils.io import load_rgb
from sharp.utils.gaussians import save_ply
from app.scene_metadata import describe

def main(path):
    logging.basicConfig(level=logging.INFO)
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA PyTorch is required. See scripts/setup.ps1.')
    state = json.loads((path / 'job.json').read_text())
    image, _, focal = load_rgb(path / state['input'])
    if state.get('focal_mm'):
        focal = state['focal_mm'] * math.hypot(image.shape[1], image.shape[0]) / math.hypot(36, 24)
    model = create_predictor(PredictorParams())
    model.load_state_dict(torch.hub.load_state_dict_from_url(DEFAULT_MODEL_URL, progress=True, map_location='cpu', weights_only=True))
    model.eval().to('cuda')
    torch.cuda.reset_peak_memory_stats()
    gaussians = predict_image(model, image, focal, torch.device('cuda'))
    save_ply(gaussians, focal, image.shape[:2], path / 'scene.ply')
    positions = gaussians.mean_vectors.detach().cpu().numpy().reshape(-1, 3)
    height,width = image.shape[:2]
    metadata = describe(positions,width,height,[[focal,0,width/2],[0,focal,height/2],[0,0,1]])
    metadata.update(model='sharp', peak_vram_gb=round(torch.cuda.max_memory_allocated()/1024**3,2),
        camera_source='manual 35mm-equivalent focal length' if state.get('focal_mm') else 'EXIF or upstream 30mm fallback')
    (path / 'scene.json').write_text(json.dumps(metadata, indent=2))
    print(json.dumps(metadata))

if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve())
