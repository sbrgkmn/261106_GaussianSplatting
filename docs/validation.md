# Local validation — 2026-11-06

## Three-model architectural comparison update

Tested on the user's previously uploaded 1448 x 1086 building photograph. Comparison ID: `b0723e7d659547b1ab4d7ab42681608b`. Identical image bytes; default EXIF/fallback calibration for SHARP/InfiniSplat; ZipSplat predicts its camera.

| Model | Total seconds | Gaussians | Peak PyTorch allocated GiB |
|---|---:|---:|---:|
| SHARP | 23.45 | 1,179,648 | 6.90 |
| InfiniSplat RGB | 36.92 | 1,472,221 | 5.16 |
| ZipSplat 504, feed-forward | 18.47 | 15,552 | 8.26 |

All completed on the A6000 and exported PLY plus calibrated camera metadata. Timing includes process startup/model loading/export. InfiniSplat's measured inference plus floater filtering was 3.68s; ZipSplat's network call was 1.02s. These are single local runs, not controlled performance benchmarks.

13 API/geometry tests passed, including comparison grouping, identical source bytes, parameter validation, queue-capacity atomicity, preservation of previous jobs, and center-depth selection. Node projection tests verified known pixel reprojection with off-center intrinsics and aspect preservation at multiple viewport shapes. Python and JavaScript syntax checks passed.

Browser inspection verified all three rendered simultaneously with per-model statistics and downloads. Tested synchronized lateral movement and full-width InfiniSplat inspection. At source view, ZipSplat is visibly softer than the dense outputs in this single-view configuration. Both SHARP and InfiniSplat exhibit disocclusion/background-edge artifacts under lateral motion. No claim that one preserves true building geometry better is established without ground truth or additional views. The comparison UI now makes these differences inspectable.

The alternative environment uses the upstream torch fallbacks (no xFormers/Triton); ZipSplat refinement is disabled. Earlier failed InfiniSplat dependency-test job is retained with its log; the corrected backend completed successfully twice. No existing photos/results were overwritten.

## Original starter validation

- NVIDIA RTX A6000, driver 573.44; CUDA PyTorch 2.6.0+cu124 and torchvision 0.21.0+cu124.
- Three API tests passed: invalid image/origin rejection, job/asset isolation, and worker failure reporting.
- Python compilation and JavaScript syntax checks passed.
- Live localhost health endpoint reports CUDA and SHARP available, with cached checkpoint.
- Real HTTP upload of upstream `vendor/ml-sharp/data/teaser.jpg` completed in **24.7 seconds**, including worker startup/model loading/inference/export.
- Produced **1,179,648 Gaussians**, **66,061,086-byte PLY**, **6.9 GiB peak PyTorch allocated GPU memory**. This excludes other GPU users and driver allocations.
- Opened completed scene in the in-app browser; visually verified splats rendered with correct upright orientation and download link available.

The bundled teaser is a collage, not an architectural benchmark. No user photo was supplied. Whole-building accuracy, real architecture quality, FPS, clean-machine installation, multi-view reconstruction, and video export have not been validated. The server binds only to `127.0.0.1:8000`.

The local environment inherits the machine's pre-existing CUDA PyTorch. Other dependencies are installed in `.venv`; direct requirements/constraints record the tested versions. npm dependencies are locked. SHARP upstream code is unmodified.
