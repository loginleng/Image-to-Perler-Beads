/**
 * 色板数据 —— 由 `scripts/gen-palettes.mjs` 从 JSON 生成，请勿手改。
 * 输入：scripts/palettes.input.json
 * 生成时间：2026-10-25T19:26:37.292Z
 *
 * ⚠️ 仓库自带的是一份**虚拟示例色板**（虚构品牌与色号），仅用于演示算法。
 * 实际生产请把它替换成你自己的色板数据 —— 本项目不包含任何真实品牌的色号表。
 */
import type { BeadColor, PaletteVariant } from '~/types'

export interface BrandPalette {
  id: string
  name: string
  brand: string
  colors: BeadColor[]
  variants?: PaletteVariant[]
}

// ==================== BeadLab / Sample Bead Set（36 色）====================
const SAMPLE_COLORS: BeadColor[] = [
  { id: "S01", code: "S01", name: "Sample White", hex: '#f7f5f2', r: 247, g: 245, b: 242, price: null },
  { id: "S02", code: "S02", name: "Sample Light Gray", hex: '#d9d9d6', r: 217, g: 217, b: 214, price: null },
  { id: "S03", code: "S03", name: "Sample Gray", hex: '#a6a6a6', r: 166, g: 166, b: 166, price: null },
  { id: "S04", code: "S04", name: "Sample Dark Gray", hex: '#6b6b6b', r: 107, g: 107, b: 107, price: null },
  { id: "S05", code: "S05", name: "Sample Charcoal", hex: '#3a3a3a', r: 58, g: 58, b: 58, price: null },
  { id: "S06", code: "S06", name: "Sample Black", hex: '#1a1a1a', r: 26, g: 26, b: 26, price: null },
  { id: "S07", code: "S07", name: "Sample Cream", hex: '#efe4d2', r: 239, g: 228, b: 210, price: null },
  { id: "S08", code: "S08", name: "Sample Sand", hex: '#d9c3a5', r: 217, g: 195, b: 165, price: null },
  { id: "S09", code: "S09", name: "Sample Tan", hex: '#b88a5e', r: 184, g: 138, b: 94, price: null },
  { id: "S10", code: "S10", name: "Sample Brown", hex: '#7b4b2a', r: 123, g: 75, b: 42, price: null },
  { id: "S11", code: "S11", name: "Sample Dark Brown", hex: '#4a2c1a', r: 74, g: 44, b: 26, price: null },
  { id: "S12", code: "S12", name: "Sample Clay", hex: '#a9603f', r: 169, g: 96, b: 63, price: null },
  { id: "S13", code: "S13", name: "Sample Blush", hex: '#f6c9c9', r: 246, g: 201, b: 201, price: null },
  { id: "S14", code: "S14", name: "Sample Pink", hex: '#ef8fa0', r: 239, g: 143, b: 160, price: null },
  { id: "S15", code: "S15", name: "Sample Red", hex: '#d62f3c', r: 214, g: 47, b: 60, price: null },
  { id: "S16", code: "S16", name: "Sample Dark Red", hex: '#8c1b27', r: 140, g: 27, b: 39, price: null },
  { id: "S17", code: "S17", name: "Sample Peach", hex: '#f7b27a', r: 247, g: 178, b: 122, price: null },
  { id: "S18", code: "S18", name: "Sample Orange", hex: '#f07c28', r: 240, g: 124, b: 40, price: null },
  { id: "S19", code: "S19", name: "Sample Amber", hex: '#e0a32e', r: 224, g: 163, b: 46, price: null },
  { id: "S20", code: "S20", name: "Sample Light Yellow", hex: '#f7e07a', r: 247, g: 224, b: 122, price: null },
  { id: "S21", code: "S21", name: "Sample Yellow", hex: '#f2c511', r: 242, g: 197, b: 17, price: null },
  { id: "S22", code: "S22", name: "Sample Mustard", hex: '#c9971f', r: 201, g: 151, b: 31, price: null },
  { id: "S23", code: "S23", name: "Sample Light Green", hex: '#cde8b5', r: 205, g: 232, b: 181, price: null },
  { id: "S24", code: "S24", name: "Sample Green", hex: '#6dbe45', r: 109, g: 190, b: 69, price: null },
  { id: "S25", code: "S25", name: "Sample Dark Green", hex: '#2e7d32', r: 46, g: 125, b: 50, price: null },
  { id: "S26", code: "S26", name: "Sample Mint", hex: '#a8ded2', r: 168, g: 222, b: 210, price: null },
  { id: "S27", code: "S27", name: "Sample Teal", hex: '#17a398', r: 23, g: 163, b: 152, price: null },
  { id: "S28", code: "S28", name: "Sample Sky", hex: '#4fa8e0', r: 79, g: 168, b: 224, price: null },
  { id: "S29", code: "S29", name: "Sample Light Blue", hex: '#bbddf2', r: 187, g: 221, b: 242, price: null },
  { id: "S30", code: "S30", name: "Sample Blue", hex: '#2563c9', r: 37, g: 99, b: 201, price: null },
  { id: "S31", code: "S31", name: "Sample Navy", hex: '#1b2f5e', r: 27, g: 47, b: 94, price: null },
  { id: "S32", code: "S32", name: "Sample Lavender", hex: '#c9b8e8', r: 201, g: 184, b: 232, price: null },
  { id: "S33", code: "S33", name: "Sample Purple", hex: '#7a4fbf', r: 122, g: 79, b: 191, price: null },
  { id: "S34", code: "S34", name: "Sample Magenta", hex: '#c2379b', r: 194, g: 55, b: 155, price: null },
  { id: "S35", code: "S35", name: "Sample Skin Light", hex: '#f3cdb4', r: 243, g: 205, b: 180, price: null },
  { id: "S36", code: "S36", name: "Sample Skin Deep", hex: '#b97c57', r: 185, g: 124, b: 87, price: null },
]

const SAMPLE_VARIANTS: PaletteVariant[] = [
  {
    id: "sample-24",
    label: "Sample 24",
    colorCount: 24,
    codes: [
      'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12',
      'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21', 'S22', 'S23', 'S24',
    ],
  },
  {
    id: "sample-36",
    label: "Sample 36",
    colorCount: 36,
    codes: [
      'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12',
      'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21', 'S22', 'S23', 'S24',
      'S25', 'S26', 'S27', 'S28', 'S29', 'S30', 'S31', 'S32', 'S33', 'S34', 'S35', 'S36',
    ],
  },
]

/** 品牌色板总表：界面与算法都按它走 */
export const ALL_BRAND_PALETTES: BrandPalette[] = [
  { id: "sample", name: "Sample Bead Set", brand: "BeadLab", colors: SAMPLE_COLORS, variants: SAMPLE_VARIANTS },
]
