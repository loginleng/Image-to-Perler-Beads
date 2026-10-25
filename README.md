# Bead Studio

**Turn any image into a bead / fuse-bead pattern — entirely in your browser.**

Drop an image, pick a paper width, get a numbered bead chart you can paint on the canvas,
recolor cell by cell and export as a high-resolution PNG. No account, no upload, no backend:
every pixel is processed locally with the Canvas API.

![Bead Studio demo](docs/demo.gif)

<sub>Demo source used in the recording: [`docs/demo-source.png`](docs/demo-source.png) — a synthetic
fractal generated with ffmpeg, so the repository stays free of third-party images.</sub>

## Try it

| | Link | What it is |
|---|---|---|
| 🎨 | **https://perlerhome.com/pages/image-convert/index** | Live tool — open and start converting immediately, no login needed |
| 🏠 | **https://perlerhome.com/intro** | The product & store-management system this tool comes from |
| 🖥 | `https://<your-user>.github.io/bead-studio/` | Static demo built from this repo (see [Static deployment](#static-deployment); replace the placeholder after the first deploy) |
| 📄 | https://perlerhome.com/features/image-to-perler | Longer write-up of the conversion pipeline |

The first two links are the real product; this repository is the self-contained, trimmed
version of the same engine, so you can read the code and run it locally.

## Features

- **Image → pattern**: drag & drop / click to upload, crop with zoom & pan, then generate.
- **Sizes**: 52 / 78 / 104 columns; height follows the source aspect ratio.
- **Palettes**: pluggable color sets with optional “variants” (sub-sets of a palette).
- **Color matching**: Euclidean RGB, CIELAB (ΔE76) or **CIEDE2000**, switchable.
- **Pattern styles**: `flat` / `detail` / `smooth` / `photo` — each one is a bundle of
  sampling, denoise and palette-merging parameters (see `PATTERN_STYLES`).
- **Editing**: 1/3/5/7-cell brush, eraser, single-cell replace, whole-color replace, undo.
- **Guides**: 10-cell guide grid, row/column coordinates with adjustable label step, zoom.
- **Statistics**: bead count per color, total beads, estimated weight, finished size in cm.
- **Export**: PNG with printed coordinates and color codes (cell size is chosen automatically
  so codes stay readable), plus “Export PDF” which opens the browser print dialog.
- **Local draft**: your pattern and settings are restored from `localStorage` on reload.

## Quick start

Requires **Node.js 20.19+** (or 22.12+). No other prerequisites.

```bash
git clone <this-repo> bead-studio
cd bead-studio
npm install
npm run dev      # http://localhost:3000
```

That is the whole setup — **no `.env`, no database, no API keys**. The editor page lives at
`/tool/image-to-bead`; `/` redirects there.

> `npm install` works with `pnpm`/`bun` too. A `.npmrc` pins `legacy-peer-deps=true` to dodge a
> crash in npm 10.8's dependency resolver (it chokes on the optional peers of `vitest`); the
> installed tree is identical either way.

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
├─ pages/tool/image-to-bead.vue   # the editor (single page, all interactions)
├─ components/tool/               # upload / settings / stats / color pickers
├─ composables/useScrollLock.ts   # modal scroll lock
├─ utils/
│  ├─ bead-algorithm.ts           # conversion + statistics + export sizing (core)
│  ├─ bead-canvas.ts              # line widths that scale with the cell size
│  ├─ palettes-data.ts            # generated sample palette (replace me)
│  ├─ pattern-codec.ts            # compact pattern (de)serialization
│  └─ image-utils.ts              # ImageData ⇄ data URL helpers
├─ i18n/locales/{en,zh}.json      # UI copy (tool.* only)
├─ scripts/gen-palettes.mjs       # JSON → palettes-data.ts
├─ scripts/palettes.input.json    # palette input example
└─ tests/                         # vitest, node environment
```

## Tests

```bash
npm test
```

Coverage focuses on the pieces that are easy to break silently:

- `tests/algorithm-chain.test.ts` — downscale → quantize → dither → statistics → export cell
  sizing invariants (all four pattern styles, determinism, `TRANSPARENT` handling, color cap).
- `tests/image-to-bead.test.ts`, `tests/pattern-codec.test.ts`, `tests/helpers/color-utils.test.ts`
  — helper functions (denoise, dominant color, nearest color, codec round-trip).

`createBeadCanvas` (DOM `<canvas>`) is not unit-tested; it needs a real canvas context.

## Static deployment

`npm run generate` writes `.output/public`. For GitHub Pages under a project path, build with
the right base URL:

```bash
NUXT_APP_BASE_URL=/bead-studio/ npm run generate
```

`.github/workflows/deploy-demo.yml` does exactly that (the repo name is filled in
automatically). Enable **Settings → Pages → Source: GitHub Actions** once.

## Notes

- **Export PDF is the browser print dialog**, not a generated PDF file. Choose “Save as PDF”
  in the print dialog if you need a file.
- Everything runs on the main thread: for very large charts (100+ columns) generation takes a
  moment on low-end phones, but nothing blocks the UI permanently.
- This project is a trimmed fork of our internal editor; commerce, 3D, accounts and the
  server/database layer were removed on purpose, and all real brand palettes were replaced
  with the fictional sample set.

## 中文简介

把一个图片转成拼豆图纸的网页编辑器：拖图 → 选宽度 → 生成图纸 → 逐格改色 → 导出 PNG 或打印。
**不登录、不上传、不联网**，算法全部在浏览器里跑（`utils/bead-algorithm.ts` 是核心）。

```bash
npm install && npm run dev   # 打开 http://localhost:3000 即可用，无需任何配置
```

仓库自带的是**虚拟示例色板**（36 色，虚构品牌与色号），仅用于演示算法。实际生产请替换
`utils/palettes-data.ts`（或改 `scripts/palettes.input.json` 后执行 `npm run gen:palettes`）——
本项目不包含任何真实品牌的色号表。

## License

[MIT](LICENSE)
