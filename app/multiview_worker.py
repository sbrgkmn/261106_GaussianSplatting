"""Joint multi-view ZipSplat inference, preserving every estimated camera."""
import json
import logging
import os
from pathlib import Path
import sys
import time

import torch
from PIL import Image, ImageOps
from torchvision.transforms.functional import to_tensor
from app.scene_metadata import describe


def reconstruct(path, state):
    from zipsplat import ZipSplat
    checkpoint = Path(os.environ['TORCH_HOME']) / 'hub/zipsplat/zipsplat-da3g-504.tar'
    if not checkpoint.is_file():
        raise RuntimeError('ZipSplat checkpoint missing. Run scripts/setup-models.ps1.')
    if not 2 <= len(state['views']) <= 16:
        raise ValueError('Multi-view reconstruction requires 2-16 photographs')
    images, original_sizes = [], []
    for entry in state['views']:
        with Image.open(path / entry['file']) as source:
            im = ImageOps.exif_transpose(source).convert('RGB')
            original_sizes.append(im.size)
            # Bound CPU tensor memory. The network itself uses a 504px training size.
            im.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            images.append(to_tensor(im))
    model = ZipSplat(weights=str(checkpoint)).cuda().eval()
    torch.cuda.reset_peak_memory_stats()
    started = time.perf_counter()
    pred = model(images, ba=False, compression=1.0)
    torch.cuda.synchronize()
    seconds = time.perf_counter() - started
    g = pred['gaussians']
    if not torch.isfinite(g.data_).all():
        raise ValueError('Model produced non-finite Gaussian parameters')
    poses = pred['poses'].inv().Rt.detach().cpu().numpy()
    ks = pred['cameras'].K.detach().cpu().numpy()
    import numpy as np
    if not np.isfinite(poses).all() or not np.isfinite(ks).all():
        raise ValueError('Model produced invalid cameras')
    cameras = []
    for i, (entry, image, (w, h)) in enumerate(zip(state['views'], images, original_sizes)):
        k = ks[i].copy()
        k[0] *= w / image.shape[2]
        k[1] *= h / image.shape[1]
        cameras.append(dict(entry, width=w, height=h, intrinsics=k.tolist(),
                            world_to_camera=poses[i].tolist()))
    g.save_ply(path / 'scene.ply')
    points = pred['poses'][0].inv().transform(g.means).detach().float().cpu().numpy()
    first = cameras[0]
    meta = describe(points, first['width'], first['height'], first['intrinsics'])
    meta.update(model='zipsplat', mode='multiview', view_count=len(images),
                camera_source='Jointly predicted from all input views by ZipSplat',
                world_to_camera=first['world_to_camera'], refinement=False,
                inference_seconds=round(seconds, 2),
                peak_vram_gb=round(torch.cuda.max_memory_allocated()/1024**3, 2),
                cameras=cameras, scale='Unknown metric scale; predicted coordinates')
    (path / 'cameras.json').write_text(json.dumps({'coordinates': meta['coordinates'],
        'scale': meta['scale'], 'cameras': cameras}, indent=2))
    return meta


def main(path):
    logging.basicConfig(level=logging.INFO)
    torch.manual_seed(42)
    if not torch.cuda.is_available():
        raise RuntimeError('Multi-view inference requires CUDA PyTorch')
    state = json.loads((path / 'job.json').read_text())
    try:
        meta = reconstruct(path, state)
    except torch.cuda.OutOfMemoryError as exc:
        raise RuntimeError('GPU memory exhausted. Retry with fewer overlapping photos, '
                           'and close other GPU applications.') from exc
    (path / 'scene.json').write_text(json.dumps(meta, indent=2))
    print(json.dumps({k: v for k, v in meta.items() if k != 'cameras'}))


if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve())
