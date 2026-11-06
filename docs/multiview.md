# Multi-view reconstruction

The `single-view-v1` tag and `main` retain the original three-model single-photo studio. The `codex/multiview-reconstruction` branch adds a separate multi-view workflow, sharing the same bounded GPU queue and local server.

## Run

Use the existing setup scripts and `scripts/start.ps1`, then open http://127.0.0.1:8000/multiview.html. Choose **2–16 overlapping photographs of the same static scene** and click **Reconstruct image set**. The order supplied by the file chooser is preserved; the first photograph defines the initial view. Start with 5–8 photographs as a practical pilot, not a model requirement. Maximum upload: 25 MB per image, 40 megapixels per image, 200 MB per request. Exact duplicate files are rejected.

For ordered folder submission:

```powershell
./.venv/Scripts/python.exe scripts/submit-multiview.py C:/path/to/photos --wait
```

The CLI uses sorted filename order. Only images are accepted in this version; extract selected, sharp, overlapping frames before uploading a video. Move the camera around the subject rather than only rotating from one position. Avoid changing focal length and moving objects. Capture corners and recessed openings from both sides where possible.

## Implementation

All images enter **one official ZipSplat 504 forward pass** with `compression=1.0` and `ba=False`. This is joint multi-view inference, not a merge of independently reconstructed photographs. The installed upstream revision and checkpoint are the same as the single-view implementation. The predictor estimates one common scene, poses, and intrinsics for every input image. EXIF orientation is applied. Images are bounded to a 1600px long edge for CPU tensor memory before the upstream 504px crop/resize; intrinsics are rescaled back to the oriented original dimensions for export and viewing.

The service stores original inputs, `scene.ply`, `scene.json`, `cameras.json`, and `run.log`. Camera matrices are **world-to-camera**, OpenCV axes (right, down, forward). The PLY stays in native model coordinates. The viewer transforms the scene into the first camera's frame and normalizes by central depth. Camera switching applies the same transform; scale is not surveyed meters. The estimated camera export preserves the original coordinate frame.

The viewer offers capture-camera selection, a corresponding source-photo inset, camera frusta, free orbit/pan/zoom, and downloads. The single-view page and its history remain separate at `/`.

## Refinement and limitations

**TokenBA is disabled and is not silently substituted.** The installed compiler is CUDA 11.8 while PyTorch is built for CUDA 12.4, and the C++ compiler is not on PATH. Feed-forward inference and browser rendering work without compiling gsplat. Enabling upstream refinement requires a compatible CUDA/C++ toolchain and its own validation; merely toggling `ba=True` is not a supported setup here.

This is an initial fast multi-view backend. It does not yet include PGSR, 2DGS, COLMAP training, mesh extraction, held-out evaluation, metric calibration, or video upload. Photometric detail and coherent capture views do not establish surface accuracy. Large motion beyond observed coverage still reveals holes and stretching. Camera estimation can fail with repetitive facades, weak texture, reflections, or insufficient overlap. The next geometry-oriented comparison should use PGSR or 2DGS on the same building captures.

## Validation on this A6000

Five bundled ZipSplat `assets/examples/office` images were submitted through the live API on 2026-11-06. Job `1473a97e33d64a5db0bfbe31d4eecd48` completed:

| Measurement | Result |
|---|---:|
| Total worker time, including model load/export | 28.12 s |
| Joint inference time | 2.24 s |
| Peak PyTorch allocated GPU memory | 8.77 GiB |
| Exported Gaussians | 103,680 |
| Estimated cameras | 5 |

PLY attributes and camera matrices were checked for finite values, counts, valid rotations, and correct image association. Browser inspection verified first/fifth capture views, free orbit, and camera visibility. Gaps appeared during extrapolated orbit. This is an execution/format test, not a ground-truth architectural accuracy benchmark; only five views have been GPU-tested so far. The 16-view service cap is not a guarantee for every GPU workload.

21 Python tests cover existing behavior plus multi-view upload validation, duplicate/count/size rejection, queue limits, cross-origin rejection, worker dispatch, and camera export access. JavaScript checks cover calibrated projections, aspect framing, and multi-view camera coordinate transforms.

## API

- `GET /api/multiview`: installed backend and upload capabilities.
- `POST /api/multiview/jobs`: multipart form, repeated file fields named `images`; returns one queued job. No refinement/query options.
- Existing job status and asset endpoints apply. Multi-view jobs have `mode: "multiview"` and an ordered `views` array.

## Primary sources

- [ZipSplat paper](https://arxiv.org/abs/2606.05102) and [official implementation](https://github.com/cvg/ZipSplat).
- [PGSR](https://github.com/zju3dv/PGSR): multi-view surface reconstruction candidate.
- [2D Gaussian Splatting](https://surfsplatting.github.io/): surface disks, perspective-correct projection and geometry regularization.
