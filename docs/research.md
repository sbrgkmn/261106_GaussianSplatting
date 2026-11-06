# Architecture reconstruction research

Reviewed 2026-11-06. Primary sources below. The Instagram reel could not be retrieved; no claim is made about its author, technique, or appearance.

| Method | Input / output | Role in this project |
|---|---|---|
| [SHARP](https://github.com/apple-aiml-research/ml-sharp), [paper](https://arxiv.org/abs/2512.10685) | One photograph → 3D Gaussians for nearby novel views | Implemented first backend. Strong fit for spatial photos and architecture experiments; not whole-building recovery. Research-only model weights. |
| [Flash3D](https://github.com/eldar/flash3d), [paper](https://arxiv.org/abs/2406.04343) | One photograph → layered Gaussians | Useful research baseline for predicted hidden content and monocular scene reconstruction. Additional integration work; not installed. |
| [ZipSplat](https://github.com/cvg/ZipSplat), [paper](https://arxiv.org/abs/2606.05102) | Unposed photos or video → cameras and Gaussians, optional refinement and compression | Promising next backend for sparse architectural captures. Supports a single image too. Requires CUDA for rendering/refinement; Windows compatibility not tested here. Apache-2.0 repository; review weights and dependencies separately. |
| [Nerfstudio](https://github.com/nerfstudio-project/nerfstudio) / [Splatfacto](https://docs.nerf.studio/nerfology/methods/splat.html) | Multi-view calibrated/pose-estimated capture → optimized Gaussians | Recommended route for more faithful buildings; requires coverage and per-scene optimization. Not a single-photo reconstructor. |
| [gsplat](https://github.com/nerfstudio-project/gsplat) | CUDA rasterization/training primitives | Foundation for custom training and rendering; not an image-to-building model on its own. |
| [Original 3DGS](https://github.com/graphdeco-inria/gaussian-splatting), [paper/project](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) | Posed multi-view photos → optimized radiance representation | Reference implementation and foundational reading; examine its own license before reuse. |
| [SuGaR](https://github.com/Anttwo/SuGaR), [paper/project](https://anttwo.github.io/sugar/) | Trained Gaussians + scene data → surface-aligned representation and mesh | Candidate when mesh editing matters. Not a guaranteed one-click conversion of monocular SHARP output. |
| [Spark](https://github.com/sparkjsdev/spark), [docs](https://sparkjs.dev/) | Existing splats → real-time Three.js rendering | Implemented browser renderer; MIT. Supports shader-driven splat effects for later artistic work. |

## Recommendation

Start with SHARP for non-commercial scientific exploration of single-image architectural scenes. Use small camera moves and evaluate believable depth before introducing stylization. For complete exterior coverage or spatially consistent interiors, capture multiple overlapping views and compare ZipSplat with a trained Splatfacto pipeline. A single photo cannot determine the true backs of buildings or the contents of occluded spaces; any generative completion is a hypothesis.

The local A6000 reports 49,140 MiB of memory and driver 573.44. CUDA PyTorch 2.6.0+cu124 was already functional. This is sufficient evidence to attempt inference, not a benchmark guarantee. SHARP predicts at a fixed internal resolution; downsampling an upload does not proportionally reduce that network's allocation. Native video rasterization may require a CUDA compiler/toolchain for gsplat; the browser viewer avoids that compilation path.

## Sources and reproducibility

SHARP source is pinned to `aed6527499ef91cba3b54c18d49a870f25947190` by the setup script. Spark 2.4.0 and Three.js 0.180.0 are pinned with npm's lockfile. Checkpoint comes from the official URL embedded in SHARP and is cached beneath `data/models`. The repository includes no training datasets or user photographs.

Model licensing source: [Apple LICENSE_MODEL](https://github.com/apple-aiml-research/ml-sharp/blob/main/LICENSE_MODEL). This is a material project-selection constraint; non-commercial artistic use should not automatically be assumed to qualify as scientific research.
