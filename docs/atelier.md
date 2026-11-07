# Architectural Atelier

Open http://127.0.0.1:8000/drawing.html with the local server running. Curated reference captures appear in the menu when installed locally; local PLY/SPZ/SPLAT/SOG/KSPLAT files can also be opened. Wireframe, Points and Capture presets control independent photographic, point and line layers. Orbit, frame and upright rotation controls adjust the composition.

Draw reveals marks over twelve seconds. Local audio modulates point size and line opacity; play the loaded track using its audio controls. PNG saves the viewport; SVG projects points and capture-colored lines without the photographic layer. Composition JSON preserves camera, source identity, rotation and settings. Local source files and audio are not embedded.

The drawing samples at most 180,000 splat centers, filters opacity/outliers, and constructs a bounded proximity graph in a Web Worker with at most 14,000 nodes. Connections are expressive spatial neighbors, not extracted masonry edges or a mesh. SVG samples at most 30,000 points. Robust framing and optional orientation metadata help with unbounded captures; arbitrary files may need rotation.

## Reconstruction

The installed portable native CLI is [Spirula Studio v2026.10.30](https://github.com/harry7557558/spirula-studio/releases/tag/v2026.10.30), under `vendor/spirula`. On a fresh checkout, download the official Windows portable release and extract it there so `vendor/spirula/spirula.exe` exists. Video input also requires ffmpeg on PATH. The project Python environment needs its existing plyfile dependency.

```powershell
./.venv/Scripts/python.exe scripts/reconstruct.py "C:/captures/building" --title "Building" --align-only
./.venv/Scripts/python.exe scripts/reconstruct.py "C:/captures/building" --title "Building"
./.venv/Scripts/python.exe scripts/reconstruct.py "C:/captures/walk.mp4" --fps 1 --max-frames 200
```

Each invocation creates an isolated directory under `data/reconstructions`; source images are copied, never changed. Camera alignment must register at least three images and 80% of the input in the largest component. This is a minimum gate, not a geometry quality guarantee. Training defaults to 30,000 iterations and a one-million-splat cap. Native viewer hosting is disabled. Completed Gaussian PLYs and metadata publish to `data/library`; published custom captures can be opened as local files in Atelier. A lock prevents concurrent project GPU submissions during the run. If a process is forcibly terminated, inspect it before removing any stale lock.

Validation on this machine: the mixed eleven-photo Notre-Dame set registered only six views and was correctly rejected. A selected six-view subset aligned 6/6, trained for 300 iterations on the RTX A6000 and published successfully. That short run is a pipeline test, not a finished reconstruction. Use a coherent overlapping capture with connected elevated and ground angles for production work.

## Reference and attribution

- [David Bewick's reference reel](https://www.instagram.com/reel/DfXe2CpxbmQ/) inspired the presentation. Its caption describes custom software; this implementation does not claim to be that software.
- [Gausseous by quixbrics](https://github.com/quixbrics/gausseous) is a relevant public MIT-licensed exploration of splat drawing, graph connections and audio response. Its architecture was researched; the implementation here was written independently.
- [Mont Saint Michel by Harry Chen / Spirula Studio](https://superspl.at/scene/ed448729) supplies the local reference capture. The linked original PLY is retained locally. The 1M-splat study copy samples the original 4,913,821 splats and omits higher-order spherical harmonics; it is not the full-fidelity original. Source page lists CC BY 4.0 and notes that permission from the original video author was not obtained. Keep that provenance attached when considering reuse.
- Other reel credits: [Bishop's Palace / Clinton Jones](https://superspl.at/scene/a344cf17), whose download requires sign-in, and [Mitsukejima / Noriyasu](https://superspl.at/scene/85ea3bf0). Bishop's Palace was subsequently imported into the local reference library; Mitsukejima was not.

Reference assets, installed binaries and generated captures are local ignored data, not bundled into Git.

## Checks

```powershell
./.venv/Scripts/python.exe -m pytest tests -q
node tests/drawing-graph.test.mjs
node tests/projection.test.mjs
node tests/multiview-camera.test.mjs
node --check web/drawing.js
```

Browser checks cover reference rendering, preset changes and SVG export. Audio and composition restoration remain interactive features requiring further use across browsers and source formats.

Construction-plane update: a fixed Y-up ground grid, horizontal panning and above-horizon orbit limits keep navigation upright. Pitch/Roll level the source; Set on ground estimates the base from the lower 3% height quantile and centers the orbit. This is an approximate base, not automatic plane fitting. Alignment and grid visibility persist in composition JSON. Verified the ground/grid view and orbit interaction in the browser.

## Reference library and earlier Sketch experiment

The Sketch and Contour sections below document inactive experiments retained in source. They are not exposed in the current interface.

The scene dropdown is curated to references; previous generated jobs remain on disk and in the reconstruction pages. Added local 1M-splat study copies of Bishop's Palace (pwnisher, CC BY 4.0), Victoria Tower (ethan3111, CC BY 4.0), the aerial medieval cathedral (Seeget3D, CC BY 4.0), and Atrium Godiva (Harry Chen, CC BY-NC 4.0). Each manifest links its source and license. Strasbourg Cathedral has no download option and was not imported. Full downloaded sources are retained; compressed captures were decoded with official PlayCanvas splat-transform 3.10.3. Study copies omit higher-order spherical harmonics.

Sketch is a separate geometry-driven mode. It samples Gaussian centers and uses the largest covariance axis as stroke direction and the smallest axis as an estimated surface normal. Repeated segmented strokes vary in angle, offset and length deterministically. Scan luminance controls stroke darkness; view-facing normals emphasize silhouette-like regions. These are artistic surface cues, not recovered CAD edges. Stroke passes, length and pencil variation control overlap. Stroke capture color blends monochrome ink with each source splat's RGB, independently of point color. The setting persists in composition JSON and SVG exports retain per-stroke colors. A worker bounds the number of sampled anchors to 22,000.

Sketch stroke update: Extend strokes overshoots the original marks and local connection endpoints. Nearby connections adds a bounded proximity scaffold with two lightly offset passes. Stroke widths vary deterministically and taper across the short segments of each pencil mark. Instanced screen-space ribbons render true pixel-width variation on WebGL implementations that only support one-pixel native lines. Line weight scales thickness independently of opacity. SVG exports preserve per-stroke widths, colors and opacity; composition settings include all new controls. No inferred connection is treated as a measured architectural edge.

## Earlier Contour prototype (inactive)

Contour is a view-dependent vector drawing rather than the object-space Sketch stroke field. It renders the photographic splats offscreen, blurs and thins tonal edges, applies hysteresis, traces connected pixels into polylines, rejects short fragments and simplifies paths. Conservative sampled depth discontinuities strengthen existing tonal boundaries; sparse depth holes do not generate their own edges. This prototype does not yet perform a dense normal-buffer pass or semantic architectural edge recognition. It can retain texture edges as well as structural edges.

Contour defaults to monochrome, with photographic and stipple layers hidden. Edge threshold controls sensitivity; Minimum contour length suppresses fragments. Echo passes and Contour overshoot add restrained repeats and extensions. The view retraces after camera movement settles; the result is a drawing of that view, not permanent 3D geometry. PNG includes the contour overlay and SVG exports connected polylines. Composition JSON retains the camera and contour settings. Tests: `node tests/contour-trace.test.mjs`.

### Responsive navigation and structural stroke hierarchy

Contour refinement now uses asynchronous GPU readback plus a dedicated worker for geometry projection, edge tracing and stroke fitting. Only one job is in flight, and camera/version checks discard stale results. During motion/refinement the overlay is hidden to expose the live capture; there is no blank-paper navigation interval. The completed overlay is cached rather than redrawn every animation frame. Exports wait for the current view to finish refining.

The stroke fitter merges nearby collinear segments without snapping to invented world axes, rejects short fragments and preserves longer connected outlines as a stronger primary layer. Short detail runs are lighter. It still operates on rendered scan evidence: it does not recognize walls/windows semantically or reconstruct CAD edges. Tests: `node tests/architectural-lines.test.mjs`, `node tests/contour-trace.test.mjs`.

Sparse diagonal hatching is derived from darker, geometry-supported capture pixels to preserve shaded masses. It is a tonal drawing aid rather than a reconstructed structural edge. Measured worker times on Mont Saint-Michel during browser checks were approximately 109–144 ms; these exclude GPU rendering/readback and camera settling, and are not an FPS measurement.


### Spatial wireframe focus (November 7)
The active atelier now uses a persistent, bounded nearest-neighbor graph of capture centers, rendered with GPU ribbons. Contour extraction and pencil-pass experiments are no longer exposed or invoked. Orbit never extracts or rebuilds geometry. Color, opacity, weight, reveal, and connection extension update uniforms; spacing, link count, and search radius rebuild in a worker on release while the previous graph remains interactive. The default source remains Mont Saint Michel. This is a spatial sketch approximation, not recovered architectural topology or a verified reproduction of the Instagram author's custom software.
