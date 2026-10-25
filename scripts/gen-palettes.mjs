/**
 * 从一份 JSON 色板描述生成 `utils/palettes-data.ts`。
 *
 * 为什么要有这个脚本：图纸里存的是**色号字符串**（如 `S01`），所以色板的
 * `code` 就是数据契约 —— 换了色板，旧图纸里的色号可能就对不上了。把色板数据
 * 放在一份 JSON 里、由脚本生成 TS 常量，可以保证 `r/g/b` 与 `hex` 永远一致，
 * 也方便你从自家库存系统导出的表格里转换。
 *
 * 用法：
 *   npm run gen:palettes                                  # 读 scripts/palettes.input.json
 *   node scripts/gen-palettes.mjs path/to/my-palette.json # 读指定文件
 *
 * 输入格式（scripts/palettes.input.json 就是一份可直接改的样例）：
 * {
 *   "palettes": [{
 *     "id": "my-palette",          // 唯一 id，界面按它选色板
 *     "name": "My Bead Set",       // 展示名
 *     "brand": "My Brand",         // 展示名（套装分组标签）
 *     "colors": [{ "code": "A01", "name": "White", "hex": "#F7F5F2", "price": null }],
 *     "variants": [{ "id": "a-24", "label": "24 colors", "codes": ["A01", "A02"] }]
 *   }]
 * }
 *
 * 说明：
 * - `price` 可省略（本项目不携带任何价格数据，一律写 null）；
 * - `variants` 可选；`codes` 会与 `colors` 求交集，不存在的色号会被忽略；
 * - 生成的产物请一并提交，运行时不读 JSON。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const TARGET = path.resolve(here, '../utils/palettes-data.ts')
const INPUT = path.resolve(here, '../' + (process.argv[2] || 'scripts/palettes.input.json'))

if (!fs.existsSync(INPUT)) {
  console.error(`找不到色板输入文件：${INPUT}`)
  console.error('用法：node scripts/gen-palettes.mjs [path/to/palette.json]')
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'))
if (!Array.isArray(data.palettes) || data.palettes.length === 0) {
  console.error('输入文件里没有 palettes 数组')
  process.exit(1)
}

const ident = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '_')
const q = (s) => JSON.stringify(s)

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) throw new Error(`非法颜色值（需要 #RRGGBB）：${hex}`)
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

const out = []
out.push('/**')
out.push(' * 色板数据 —— 由 `scripts/gen-palettes.mjs` 从 JSON 生成，请勿手改。')
out.push(` * 输入：${path.relative(path.resolve(here, '..'), INPUT).replace(/\\/g, '/')}`)
out.push(` * 生成时间：${new Date().toISOString()}`)
out.push(' *')
out.push(' * ⚠️ 仓库自带的是一份**虚拟示例色板**（虚构品牌与色号），仅用于演示算法。')
out.push(' * 实际生产请把它替换成你自己的色板数据 —— 本项目不包含任何真实品牌的色号表。')
out.push(' */')
out.push("import type { BeadColor, PaletteVariant } from '~/types'")
out.push('')
out.push('export interface BrandPalette {')
out.push('  id: string')
out.push('  name: string')
out.push('  brand: string')
out.push('  colors: BeadColor[]')
out.push('  variants?: PaletteVariant[]')
out.push('}')
out.push('')

const paletteIdents = []

for (const p of data.palettes) {
  if (!p.id) throw new Error('每个 palette 都需要 id')
  const colors = (p.colors || []).map((c) => {
    if (!c.code) throw new Error(`palette ${p.id} 里有颜色缺少 code`)
    const { r, g, b } = hexToRgb(c.hex)
    return {
      code: String(c.code),
      name: String(c.name || c.code),
      hex: String(c.hex).toLowerCase(),
      r,
      g,
      b,
      price: c.price ?? null,
    }
  })
  if (colors.length === 0) throw new Error(`palette ${p.id} 没有任何颜色`)

  const key = ident(p.id)
  out.push(`// ==================== ${p.brand || p.id} / ${p.name || p.id}（${colors.length} 色）====================`)
  out.push(`const ${key}_COLORS: BeadColor[] = [`)
  for (const c of colors) {
    out.push(
      `  { id: ${q(c.code)}, code: ${q(c.code)}, name: ${q(c.name)}, hex: '${c.hex}', ` +
        `r: ${c.r}, g: ${c.g}, b: ${c.b}, price: ${c.price === null ? 'null' : Number(c.price)} },`
    )
  }
  out.push(']')
  out.push('')

  const codes = new Set(colors.map((c) => c.code))
  const variants = (p.variants || [])
    .map((v) => ({
      id: v.id,
      label: v.label || v.id,
      codes: (v.codes || []).filter((code) => codes.has(String(code))),
    }))
    .filter((v) => v.codes.length > 0)

  if (variants.length) {
    out.push(`const ${key}_VARIANTS: PaletteVariant[] = [`)
    for (const v of variants) {
      out.push('  {')
      out.push(`    id: ${q(v.id)},`)
      out.push(`    label: ${q(v.label)},`)
      out.push(`    colorCount: ${v.codes.length},`)
      out.push('    codes: [')
      for (let i = 0; i < v.codes.length; i += 12) {
        out.push(`      ${v.codes.slice(i, i + 12).map((x) => `'${x}'`).join(', ')},`)
      }
      out.push('    ],')
      out.push('  },')
    }
    out.push(']')
    out.push('')
  }

  paletteIdents.push({ p, key, hasVariants: variants.length > 0, count: colors.length })
}

out.push('/** 品牌色板总表：界面与算法都按它走 */')
out.push('export const ALL_BRAND_PALETTES: BrandPalette[] = [')
for (const { p, key, hasVariants } of paletteIdents) {
  const v = hasVariants ? `, variants: ${key}_VARIANTS` : ''
  out.push(`  { id: ${q(p.id)}, name: ${q(p.name || p.id)}, brand: ${q(p.brand || p.id)}, colors: ${key}_COLORS${v} },`)
}
out.push(']')
out.push('')

fs.writeFileSync(TARGET, out.join('\n'), 'utf8')

console.log(`已生成 ${path.relative(process.cwd(), TARGET)}`)
for (const { p, count } of paletteIdents) {
  console.log(`  ${(p.brand || p.id).padEnd(16)} ${(p.name || p.id).padEnd(24)} ${String(count).padStart(3)} 色`)
}
