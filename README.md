# Architecture Splat Lab

Local photo-to-Gaussian reconstruction with **SHARP, InfiniSplat RGB, and ZipSplat 504**. Upload once, run selected models, compare synchronized views, and download each PLY. Processing and browser assets stay local.

**Multi-view implementation:** open http://127.0.0.1:8000/multiview.html to reconstruct 2–16 overlapping photographs jointly with ZipSplat, inspect each predicted camera, and export the scene and camera poses. See [multi-view setup, limitations, and measured validation](docs/multiview.md). The original single-view snapshot is preserved at the `single-view-v1` tag.

## Start

```powershell
./scripts/setup.ps1
./scripts/setup-models.ps1
./scripts/start.ps1
```

Open http://127.0.0.1:8000. This machine is already configured; use the running server if port 8000 is occupied. Only one server should operate on `data/jobs` at a time.

1. Choose a JPEG, PNG, or WebP, or click a previous exploration to reuse its photograph.
2. Select one or all three models. Optionally choose a known **35mm-equivalent** focal length.
3. Click **Run selected models**. Jobs run sequentially on the GPU.
4. Use **Lateral**, **Vertical**, **Move forward**, or **Animate parallax** for matched comparisons. Use **Inspect** to enlarge one model while retaining the camera position. **Source view** resets motion. **Free orbit** exposes areas not observed in the photo.
5. Download the model-specific PLY and camera/metrics JSON. Failures are isolated and link to their log.

The viewer preserves source aspect ratio and calibrated intrinsics rather than stretching/cropping the photo to fit a viewport. Motion is normalized by each model's central scene depth; it is **not** a comparison at the same surveyed metric camera position. Exported PLYs retain their native scale; the viewer normalization is only for inspection.

## Backends

| Backend | Local implementation | Camera |
|---|---|---|
| SHARP | Official predictor, fixed upstream inference resolution | EXIF or 30mm fallback; manual override |
| InfiniSplat RGB | Official encoder, 1.5M support samples, upstream floater filter | EXIF or 30mm fallback; manual override |
| ZipSplat 504 | Official released model at 504px, full token budget, `ba=False` | Predicted intrinsics and source pose |

ZipSplat's optional test-time refinement is **disabled**: it needs a working gsplat CUDA compiler toolchain. Triton and xFormers are not installed; the upstream torch fallbacks are used. The repository notes possible numerical drift without fused xFormers SwiGLU. This is a feed-forward comparison, not the fully refined ZipSplat paper configuration.

SHARP runs in `.venv`; alternatives use `.venv-models` to isolate NumPy and other dependencies. On this machine both environments inherit the pre-existing CUDA PyTorch 2.6.0+cu124. Setup scripts support fresh isolated environments with explicit CUDA installation. Global packages and upstream model source are not modified.

Requirements: Windows, Python 3.12, uv, Git, Node/npm, NVIDIA driver compatible with CUDA 12.4. Model weights require several GB of disk space each. Each job starts a separate process and releases GPU memory on exit. Runtime shown includes model initialization and export, not just neural inference.

## Architectural limitations

These are renderable splats, not CAD/BIM, watertight meshes, or surveyed models. A single photo cannot establish the true back facade, room layout, or occluded window geometry. Models can disagree about depth even when their source views look similar. Compare corners, recesses, silhouettes, and disocclusion artifacts, not just source-view sharpness.

For stronger architectural preservation over large camera motion, use **real overlapping photographs of the same building** in the new multi-view page. The original comparison page still takes one photograph. Multi-view currently uses feed-forward ZipSplat; COLMAP/Splatfacto, PGSR, and 2DGS are not integrated yet.

The Instagram reel was not accessible, so its capture method and effects have not been identified or reproduced.

## Licensing and research

[Research comparison](docs/research.md), [comparison notes](docs/comparison.md), and [validation](docs/validation.md).

- SHARP weights: non-commercial scientific research; excludes commercial product development.
- InfiniSplat: personal/evaluation use permitted without registration; organizational project use requires upstream registration. Third-party component terms remain applicable.
- ZipSplat: inspect the upstream repository and checkpoint terms before redistribution or deployment.

## Development

```powershell
./.venv/Scripts/python.exe -m pytest tests -q
node tests/projection.test.mjs
node tests/multiview-camera.test.mjs
```

`app/server.py` owns persistent jobs and a bounded queue. `app/worker.py` wraps SHARP; `app/alternative_worker.py` wraps the alternatives. `app/scene_metadata.py` computes source-camera information. `web/projection.mjs` handles calibrated projection and letterboxing. `data/jobs` and `data/models` are ignored by Git.

API: `GET /api/models`, `GET /api/health`, `GET /api/jobs`, `POST /api/jobs?models=sharp,infinisplat,zipsplat` (raw image bytes), `POST /api/jobs/{id}/compare?models=...`, `GET /api/jobs/{id}`, `GET /api/jobs/{id}/scene.ply`. Optional `focal_mm=24` applies to SHARP/InfiniSplat; ZipSplat always predicts its own camera. Existing single-model clients can continue using `POST /api/jobs` and receive one job object. Comparison calls return an array.

The service binds to loopback only, rejects cross-origin writes, caps images at 25 MB / 40 MP, and allows six queued/running jobs. Server restarts mark interrupted jobs failed. Select the saved photo and run again to retry.
