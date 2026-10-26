# Bead Studio

<p>
  <a href="./README.en.md">English</a> · <a href="./README.md">简体中文</a>
</p>

**Turn any image into a bead / fuse-bead pattern — entirely in your browser.**

Drop an image, pick a paper width, get a numbered bead chart you can paint on the canvas,
recolor cell by cell and export as a high-resolution PNG. No account, no upload, no backend:
every pixel is processed locally with the Canvas API.

![Bead Studio demo](docs/demo.gif)

<sub>Demo source used in the recording: [`docs/demo-source.png`](docs/demo-source.png) — a synthetic
fractal generated with ffmpeg, so the repository stays free of third-party images.</sub>

## Try it

| Type | Link | Description |
|---|---|---|
| 🖥 Static demo | **https://loginleng.github.io/openBead/** | GitHub Pages demo built from this repo |
| 🎨 Hosted tool | **https://perlerhome.com/pages/image-convert/index** | Hosted service running the same engine — open and convert immediately, no login needed |
| 🏠 Product page | **https://perlerhome.com/intro** | Product introduction page |
| 📄 Write-up | https://perlerhome.com/features/image-to-perler | Detailed article about the conversion pipeline |

This repository is a standalone implementation of the conversion engine: run it locally or
deploy it as a static site anywhere.

## Features

<img src="docs/screenshot.png" width="760" alt="Bead Studio editor screenshot" />

- **Image → pattern**: drag & drop / click to upload, crop with zoom & pan — the chart
  regenerates automatically on every change (paper width, palette, style, advanced parameters).
- **Sizes**: 52 / 78 / 104 columns; height follows the source aspect ratio.
- **Palettes**: pluggable color sets with optional “variants” (sub-sets of a palette).
- **Color matching**: Euclidean RGB, CIELAB (ΔE76) or **CIEDE2000**, switchable.
- **Pattern styles**: `flat` / `detail` / `smooth` / `photo` — each one is a bundle of
  sampling, denoise and palette-merging parameters (see `PATTERN_STYLES`).
- **Advanced parameters**: every knob behind those presets is exposed — sampling mode, color
  matching (CIEDE2000 / ΔE76 / RGB), clustering, denoise strength & gate, region/palette merge,
  color cap, dark-spot cleanup, dithering (strength, color pool, gradient gate) and the four
  edge switches (line art, diagonal lines, outline restore, feature restamp). Presets only
  provide defaults; any edit is marked as “N changed” with one-click reset.

  <img src="docs/screenshot-advanced.png" width="760" alt="Advanced parameter panel" />
- **Editing**: 1/3/5/7-cell brush, eraser, single-cell replace, whole-color replace, undo.
- **Guides**: 10-cell guide grid, row/column coordinates with adjustable label step, zoom.
- **Statistics**: bead count per color, total beads, estimated weight, finished size in cm.
- **Export**: PNG with printed coordinates and color codes (cell size is chosen automatically
  so codes stay readable). Example output: [`docs/export-sample.png`](docs/export-sample.png)
  (52 columns, 2568×2732 px).

## Quick start

Requires **Node.js 20.19+** (or 22.12+). No other prerequisites.

```bash
git clone https://github.com/loginleng/openBead.git bead-studio
cd bead-studio
npm install
npm run dev      # http://localhost:3000
```

That is the entire configuration — **no `.env`, no database, no API keys**. The editor page
lives at `/tool/image-to-bead`; `/` redirects there.

> `npm install` also works with `pnpm`/`bun`. A `.npmrc` pins `legacy-peer-deps=true` to work
> around a crash in npm 10.8's dependency resolver (it fails on the optional peers of
> `vitest`); the installed tree is identical either way.

```bash
npm test          # vitest: algorithm chain + unit tests
npm run build     # production build (Nitro/node-server)
npm run generate  # static build → .output/public (for GitHub Pages / any CDN)
```

## Palettes: bring your own

> The repository ships with a **fictional sample palette** (36 colors, invented brand and
> color codes) used only to demo the algorithm.
> For real production, replace `utils/palettes-data.ts` with your own color data — **this
> project does not include any real brand's color chart.**

How to swap it:

1. Edit `scripts/palettes.input.json` (format documented at the top of `scripts/gen-palettes.mjs`) —
   the only required fields per color are `code` and `hex`; `name` is optional and `price`
   can stay `null`.
2. Run `npm run gen:palettes`. It regenerates `utils/palettes-data.ts` (and derives `r/g/b`
   from each `hex`, so the data can never drift).
3. Or just hand-edit `utils/palettes-data.ts` — it is a plain TS constant.

Keep color **codes stable**: a pattern stores codes, not RGB, so renaming a code invalidates
old charts.

## How the algorithm works

`utils/bead-algorithm.ts` is the core asset (~4k lines, zero network / DOM dependencies except
one canvas helper). The pipeline in `convertImageToBeadPattern`:

1. **Fit** the source (progressive area-downscale above a pixel budget, so thin strokes survive).
2. **Detect** small features (eyes/dots) and outline masks at source resolution.
3. **Downscale per cell**: edge-aware weighted quantization (default), or area-average /
   dominant / median sampling for the “smooth” and “photo” styles.
4. **Quantize** each cell to the nearest palette color, with denoise, region merge and
   whole-palette merge passes.
5. **Optional dithering** with a gradient gate (only smooth gradients get dithered, hard edges don't).
6. **Restamp** small features, symmetrize, restore outlines, clean dark spots, cap color count.
7. **Count** beads per code and return `{ pattern, stats, totalBeads }`.

`pattern` is a `string[][]` of color codes (`'TRANSPARENT'` for empty cells) — that is the
only interchange format between the algorithm, the canvas renderer and the exporter.

## Project structure

```
bead-studio/
├─ pages/tool/image-to-bead.vue   # editor page: state, conversion, wiring
├─ components/tool/
│  ├─ Toolbar.vue                 # view toggles · tools · brush settings · undo
│  ├─ BeadCanvas.vue              # canvas rendering + wheel zoom / pan / hover / painting
│  ├─ ExportBar.vue               # export button (calls utils/bead-export)
│  ├─ CropDialog.vue              # crop modal (draggable, resizable box)
│  ├─ ColorDialog.vue             # color picker modal (brush / replace / replace-all)
│  ├─ UploadDropzone.vue          # drop zone + preview (pan & zoom)
│  ├─ SettingsPanel.vue           # one card: basics · palette · style · advanced (collapsed)
│  ├─ AdvancedSettings.vue        # all pattern knobs, grouped, with preset-diff badge
│  ├─ PatternStatsCard.vue        # bead count table
│  └─ ColorPicker.vue             # color swatch grid
├─ composables/useScrollLock.ts   # modal scroll lock
├─ utils/
│  ├─ bead-algorithm.ts           # conversion + statistics + export sizing (core)
│  ├─ bead-canvas.ts              # line widths that scale with the cell size + guide overlay
│  ├─ bead-export.ts              # composes the exported PNG (chart + coords + stats block)
│  ├─ pattern-params.ts           # presets → editable parameter set (diff / reset)
│  └─ palettes-data.ts            # generated sample palette (replace me)
├─ i18n/locales/{en,zh}.json      # UI copy (tool.* only)
├─ scripts/gen-palettes.mjs       # JSON → palettes-data.ts
├─ scripts/palettes.input.json    # palette input example
└─ tests/                         # vitest, node environment
```

Data flows one way: `pattern` (a `string[][]` of color codes) lives in the page, and every
component either reads it (`BeadCanvas`, `ExportBar`, `PatternStatsCard`) or emits an intent
(`Toolbar` toggles, `BeadCanvas` paint/select events, `CropDialog` confirm). Only the page
mutates the pattern and recomputes stats — no second source of truth.

## Tests

```bash
npm test
```

Coverage focuses on the algorithm core chain:

- `tests/algorithm-chain.test.ts` — downscale → quantize → dither → statistics → export cell
  sizing invariants (all four pattern styles, determinism, `TRANSPARENT` handling, color cap).
- `tests/bead-export.test.ts` — exported stats-block layout (row/column math, compression cap).
- `tests/pattern-params.test.ts` — preset → parameter flattening (per-style values, diff count).
- `tests/image-to-bead.test.ts`, `tests/helpers/color-utils.test.ts` — helper functions
  (denoise, dominant color, nearest color).

`createBeadCanvas` (DOM `<canvas>`) is not unit-tested; it needs a real canvas context.

## Notes

- All computation runs on the main thread: very large charts (100+ columns) take longer to
  generate on low-end devices, but the UI is never permanently blocked.
- All palettes in this repository are fictional sample data (invented brands and color
  codes); no real brand's color chart is included.

## 中文文档

简体中文说明见 [README.md](./README.md)（默认显示）。

## License

[MIT](LICENSE)
