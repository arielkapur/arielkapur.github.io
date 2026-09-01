# August roadmap for site development

## Changes to implement to Solar System project version 190826

### Menus (on planet selection)
- Troubleshoot menus not showing up sometimes
- Fix pronunciations in menus - 'MAHRZ' → `/mɑːrz/` (done)
- Info box redesign - discrete boxes with padding on all sides filling 50% of screen

### WebGL camera movement & controls changes
- Hit spacebar to play / pause orbit animation

- Focusing on planet causes:
1. info box to pop up on right side of screen, and bottom side for mobile
2. camera to center on planet
3. planet to center on 1/4 from left of screen, 1/4 from top for mobile
4. planet to center on 1/2 from top of screen, 1/2 from left for mobile

### Mobile compatability changes
- Enable zoom controls for mobile - two fingers for camera zoom, one finger for camera pan

#### And add small UI changes, font customisaitons, redesign

## New project: Projector

Concept: AI-based project planner. Initial UI like ChatGPT - rounded text box centered on screen, small logo on top
background color #f9f9f9, greytext in text box has variable text e.g. "I want to build a time machine...*

#### Example prompt: 
##### I want to build a space probe.

After the user enters this prompt, a few components should show up.

First, a budget variable should be preset based on context memory & scale of project.

Changing the budget slider should alter the following components.

Resource list - list of raw materials and raw material prices for the project. Each resource should be confined to a small rectangular text box with a small image representing it, a header in the middle, a price, then a brief info or description detailing a) use within project context and b) acquisition hurdles.

Legislative hurdles - to launch a space probe, there are probably some conflicts with aerospace restrictions. There may also be components that are impossible, difficult or illegal to obtain given the user's location. The A.I. needs to be compliant to legal restrictions and designed to account for the legal ramificaitons of the project.

## estack — FiTS Viewer (Flexible Image Transport System)

A browser-based, local-first FITS astronomy viewer/stacker/compositor, living in [`fits-viewer/`](fits-viewer/). No build step, no server required — plain HTML/CSS/JS, same stack as the rest of this site.

### Running it

- **Static hosting (GitHub Pages, etc.):** just deploy the repo; open `fits-viewer/index.html` (linked from the homepage as "estack — FiTS viewer").
- **Local dev:** serve the repo root with any static file server, e.g. `python3 -m http.server` then visit `http://localhost:8000/fits-viewer/index.html`. A server is recommended because the stacking Web Worker (`stack-worker.js`) may be blocked by the browser when the page is opened directly via `file://`; the app falls back to a chunked main-thread stacker in that case, so it still works, just slower.
- All FITS parsing and pixel processing happens **entirely in your browser** — files are never uploaded anywhere.

### Supported MVP workflow

1. **Load** one or more `.fits`/`.fit` files via the file picker. Each file is parsed locally (`fits-parser.js`): the header is read first, then pixel data is streamed in ~4MB chunks (yielding to the event loop between chunks) so large files don't freeze the tab, with a per-file progress bar.
2. **Stack** any two or more same-dimension frames using average or median combination, computed in a Web Worker (`stack-worker.js`) so the UI stays responsive, with a synchronous chunked fallback if Workers aren't available.
3. **Organize** frames/stacks into a **Group → Layer → Sublayer** hierarchy, with per-node visibility toggles and up/down reordering.
4. **Tag filters**: assign H-alpha, H-beta, OIII, SII, Luminance or custom/unfiltered labels per frame (auto-detected from the FITS `FILTER` header keyword when present), then isolate the composite to a single filter via the toggle row.
5. **Assign hex colors** per frame/stack and see a live **composite preview** (screen-blend compositing across all visible, filter-matching sublayers).
6. **Adjust RGB curves**: a Photoshop-style, per-channel (R/G/B) control-point curve editor (`curves.js`) generates a 256-entry lookup table applied live to the composite.
7. **AI Companion** panel (`ai-companion.js`): fully local, non-networked workflow tips/hints based on your current frames/stacks/curves state — no API keys or backend calls.

### Known limitations (MVP)

- Only the primary HDU of a FITS file is parsed (no multi-extension FITS support yet).
- Composite preview is downsampled to a max of 640px on the longest edge for interactive performance; full-resolution export is not yet implemented.
- Stretch/normalization is a simple linear min/max stretch — no log/asinh/histogram presets yet.
- Assigning a frame to a hierarchy layer currently uses a simple prompt-based picker rather than drag-and-drop.
- Tested primarily with 8/16/32-bit integer and 32/64-bit float, single-image, 2D FITS files.
- Very large (100MB+) files rely on your browser's available memory once fully parsed into a `Float32Array`; chunked reads keep the UI responsive during *parsing*, but the whole decoded image is currently held in memory for stacking/compositing.

### Roadmap

- Histogram stretch presets (linear / log / asinh) and auto-stretch.
- Optional denoise / deconvolution pass.
- Project save/load sessions (serialize groups/layers/curves/colors to JSON).
- Batch import with progressive/tiled preview rendering for very large mosaics.
- Drag-and-drop hierarchy assignment (replacing the prompt-based picker).
- A privacy/local-only mode indicator, and optional richer AI-companion suggestions.
- Multi-extension FITS (multiple HDUs) support.
