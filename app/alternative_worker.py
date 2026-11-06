"""Official-model adapters. No rasterizer compilation is needed for PLY export."""
import json
import logging
import os
from pathlib import Path
import sys
import time
import numpy as np
import torch
from app.scene_metadata import describe

ROOT = Path(__file__).resolve().parents[1]

def infinisplat(path, state):
    sys.path.insert(0, str(ROOT / 'vendor/InfiniSplat/InfiniSplat_v1'))
    from src.demo.infer_single_image import (load_demo_config, load_demo_encoder,
        load_demo_image_bundle, run_single_image_inference, filter_final_gaussian_floaters)
    from src.utils.gaussians import save_ply
    checkpoint = Path(os.environ['TORCH_HOME']) / 'infinisplat/infinisplat_rgb.ckpt'
    if not checkpoint.is_file():
        raise RuntimeError('InfiniSplat checkpoint missing. Run scripts/setup-models.ps1.')
    bundle = load_demo_image_bundle(path / state['input'], focal_length_mm=state.get('focal_mm'))
    model = load_demo_encoder(load_demo_config('infinisplat_hypersim_rgb'), checkpoint, torch.device('cuda'))
    torch.cuda.reset_peak_memory_stats()
    started = time.perf_counter()
    output = run_single_image_inference(model, bundle.inference_image,
        bundle.inference_intrinsics.intrinsics_px, torch.device('cuda'))
    gaussians = filter_final_gaussian_floaters(output['gaussians'])
    torch.cuda.synchronize()
    inference_seconds = time.perf_counter() - started
    save_ply(gaussians, bundle.original_intrinsics.focal_length_px,
             bundle.original_image_shape, path / 'scene.ply')
    h,w = bundle.original_image_shape
    positions = gaussians.mean_vectors.detach().float().cpu().numpy().reshape(-1,3)
    meta = describe(positions, w,h,bundle.original_intrinsics.intrinsics_px.cpu().numpy())
    meta['inference_seconds'] = round(inference_seconds, 2)
    meta['camera_source'] = 'manual 35mm-equivalent focal length' if state.get('focal_mm') else 'EXIF or upstream 30mm fallback'
    return meta

def zipsplat(path, state):
    from zipsplat import ZipSplat
    from PIL import Image, ImageOps
    from torchvision.transforms.functional import to_tensor
    # The released feed-forward model works without Triton or gsplat CUDA compilation.
    checkpoint = Path(os.environ['TORCH_HOME']) / 'hub/zipsplat/zipsplat-da3g-504.tar'
    if not checkpoint.is_file():
        raise RuntimeError('ZipSplat checkpoint missing. Run scripts/setup-models.ps1.')
    model = ZipSplat(weights=str(checkpoint)).cuda().eval()
    with Image.open(path / state['input']) as im:
        image = to_tensor(ImageOps.exif_transpose(im).convert('RGB'))
    torch.cuda.reset_peak_memory_stats()
    started = time.perf_counter()
    pred = model([image], ba=False, compression=1.0)
    torch.cuda.synchronize()
    inference_seconds = time.perf_counter()-started
    g = pred['gaussians']
    g.save_ply(path / 'scene.ply')
    # The first predicted pose is near identity, not guaranteed to be identity.
    # Keep PLY in model coordinates and supply its exact source view to the viewer.
    view = pred['poses'][0].inv()
    points = view.transform(g.means).detach().float().cpu().numpy().reshape(-1,3)
    meta = describe(points, image.shape[2], image.shape[1],pred['cameras'].K[0].cpu().numpy())
    meta.update(inference_seconds=round(inference_seconds,2), camera_source='predicted by ZipSplat',
                refinement=False, world_to_camera=view.Rt.cpu().tolist())
    return meta

def main(path):
    logging.basicConfig(level=logging.INFO)
    torch.manual_seed(42)
    if not torch.cuda.is_available():
        raise RuntimeError('Alternative environment must use CUDA PyTorch')
    state = json.loads((path/'job.json').read_text())
    meta = {'infinisplat':infinisplat,'zipsplat':zipsplat}[state['model']](path,state)
    meta.update(model=state['model'], peak_vram_gb=round(torch.cuda.max_memory_allocated()/1024**3,2))
    (path/'scene.json').write_text(json.dumps(meta,indent=2))
    print(json.dumps(meta))

if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve())
