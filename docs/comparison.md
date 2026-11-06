# Architectural comparison implementation

The first implementation used one model, an assumed focal length for photos without EXIF, an image-independent viewport aspect, and unconstrained orbit. Fixing the display does not fix inferred scene geometry, so the update separates those concerns.

## Changes

- Preserve each source image's aspect ratio using letterboxing; construct the OpenGL projection from fx, fy, cx, cy.
- Use each model's original source camera. ZipSplat's first pose is near identity, not guaranteed identity, so its exact world-to-camera transform accompanies the PLY.
- Choose motion focus from the central 44% of the image to reduce background/sky influence.
- Compare identical input bytes and lens settings in one persistent comparison group. Existing outputs are retained.
- Shared camera rig and normalized depth make motions comparable; raw scene scales are not claimed to match ground truth.
- Isolate GPU workers and Python environments; preserve model-specific failures and logs.

## Why these models

[InfiniSplat](https://arxiv.org/abs/2608.02437) explicitly targets coherent structure under larger single-photo viewpoint changes through geometry-guided sampling and implicit Gaussian decoding. Its claims motivate evaluation; they do not guarantee superiority on a particular facade.

[ZipSplat](https://github.com/cvg/ZipSplat) predicts intrinsics and camera poses along with Gaussians. Its release also supports multi-view input, making it a useful potential next step for real building captures. This integration evaluates the single-view, feed-forward configuration with refinement disabled and no xFormers/Triton kernels.

## Pinned upstream sources

- InfiniSplat: `694ec543d8a99d76cbc421bc6ba2aa071a8ef210`, RGB checkpoint from `PLUS-WAVE/InfiniSplat`.
- ZipSplat: `73ab63f048fcc15ee54ada4ef9cdd79b925611a8`, `zipsplat-da3g-504.tar` from `veichta/zipsplat`.
- SHARP: `aed6527499ef91cba3b54c18d49a870f25947190`.

## Inspection protocol

Start at the source view. Move laterally by 5%, then 10% of central depth; inspect facade corner angles, arches/recesses, roofline, and background gaps. Repeat vertically. Keep the same selected lens for SHARP and InfiniSplat. ZipSplat uses its predicted camera, so field of view can legitimately differ. Lens overrides are controlled experiments, not recovered calibration.

This is qualitative comparison without ground-truth depths or held-out photographs. No numerical architectural-accuracy ranking is asserted. The source photo already uploaded to the local app is reused locally and is not sent to the model hosts.
