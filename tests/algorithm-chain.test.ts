/**
 * 算法主链测试：降采样 → 量化 → 抖动/回贴 → 统计 → 导出格尺寸。
 *
 * 为什么这组必须有：`utils/bead-algorithm.ts` 是项目的核心资产，
 * 改一个常量就可能悄悄改变出图效果。这里锁定的是**结构性不变量**
 * （尺寸、色号合法性、统计口径、确定性、导出口径），而不是逐像素快照 ——
 * 后者会因为无关紧要的调参大面积变红，最后没人看。
 */
import { describe, it, expect } from 'vitest'
import {
  PATTERN_STYLES,
  calcExportCellSize,
  convertImageToBeadPattern,
  countPatternStats,
  maxCodeLength,
  minCellForCode,
  weightedDownscale,
  type PatternStyleKey,
} from '~/utils/bead-algorithm'
import { calcBeadLineMetrics } from '~/utils/bead-canvas'
import { ALL_BRAND_PALETTES } from '~/utils/palettes-data'

const PALETTE = ALL_BRAND_PALETTES[0].colors
const CODES = new Set(PALETTE.map(c => c.code))

/** 造一张 4 色块 + 中间黑色竖线的合成图（模拟“描边 + 色块”的典型输入） */
function makeImage(w = 64, h = 64) {
  const data = new Uint8ClampedArray(w * h * 4)
  const midX = Math.floor(w / 2)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let r: number
      let g: number
      let b: number
      if (x >= midX - 1 && x <= midX) {
        r = 20; g = 20; b = 20 // 竖线
      } else if (x < midX && y < h / 2) {
        r = 220; g = 60; b = 60
      } else if (x >= midX && y < h / 2) {
        r = 60; g = 160; b = 90
      } else if (x < midX) {
        r = 40; g = 90; b = 200
      } else {
        r = 245; g = 220; b = 70
      }
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { data, width: w, height: h }
}

/** 白底 + 中间红色方块：用于验证去背景产出 TRANSPARENT */
function makeImageWithWhiteBg(w = 48, h = 48) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const inSquare = x > w / 4 && x < (w * 3) / 4 && y > h / 4 && y < (h * 3) / 4
      const v = inSquare ? [200, 40, 40] : [255, 255, 255]
      data[i] = v[0]
      data[i + 1] = v[1]
      data[i + 2] = v[2]
      data[i + 3] = 255
    }
  }
  return { data, width: w, height: h }
}

describe('weightedDownscale（边缘感知加权量化）', () => {
  it('输出尺寸与像素缓冲严格对应当前请求', () => {
    const src = makeImage()
    const out = weightedDownscale(src.data, src.width, src.height, 16, 16, PALETTE, {})

    expect(out.width).toBe(16)
    expect(out.height).toBe(16)
    expect(out.data.length).toBe(16 * 16 * 4)
    expect(out.mixedCells).toBeGreaterThanOrEqual(0)
    expect(out.lineCells).toBeGreaterThanOrEqual(0)
  })

  it('同一输入两次结果一致（算法必须确定性，不能有随机抖动）', () => {
    const src = makeImage()
    const a = weightedDownscale(src.data, src.width, src.height, 24, 24, PALETTE, {})
    const b = weightedDownscale(src.data, src.width, src.height, 24, 24, PALETTE, {})
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
    expect(a.mixedCells).toBe(b.mixedCells)
  })

  it('不改动调用方传入的源像素缓冲', () => {
    const src = makeImage()
    const before = Array.from(src.data)
    weightedDownscale(src.data, src.width, src.height, 12, 12, PALETTE, {})
    expect(Array.from(src.data)).toEqual(before)
  })
})

describe('convertImageToBeadPattern（生产链路）', () => {
  const STYLE_KEYS = Object.keys(PATTERN_STYLES) as PatternStyleKey[]

  it.each(STYLE_KEYS)('风格 %s 能跑通且产出合法图纸', (key) => {
    const src = makeImage()
    const result = convertImageToBeadPattern({
      imageData: src,
      targetWidth: 32,
      targetHeight: 32,
      palette: PALETTE,
      ...PATTERN_STYLES[key],
    })

    expect(result.pattern).toHaveLength(32)
    for (const row of result.pattern) {
      expect(row).toHaveLength(32)
      for (const code of row) {
        expect(code === 'TRANSPARENT' || CODES.has(code)).toBe(true)
      }
    }
    expect(result.totalBeads).toBeGreaterThan(0)
  })

  it('统计口径与图案一致：totalBeads = 非透明格数 = stats 计数之和', () => {
    const src = makeImage()
    const result = convertImageToBeadPattern({
      imageData: src,
      targetWidth: 24,
      targetHeight: 24,
      palette: PALETTE,
      ...PATTERN_STYLES.detail,
    })

    const nonTransparent = result.pattern.flat().filter(c => c !== 'TRANSPARENT').length
    const statSum = result.stats.reduce((n, s) => n + s.count, 0)

    expect(result.totalBeads).toBe(nonTransparent)
    expect(statSum).toBe(nonTransparent)
    expect(countPatternStats(result.pattern, PALETTE)).toEqual({
      stats: result.stats,
      totalBeads: result.totalBeads,
    })
  })

  it('相同输入产出相同图案（回归时可安全对比）', () => {
    const src = makeImage()
    const options = {
      imageData: src,
      targetWidth: 20,
      targetHeight: 20,
      palette: PALETTE,
      ...PATTERN_STYLES.flat,
    }
    expect(convertImageToBeadPattern(options).pattern)
      .toEqual(convertImageToBeadPattern({ ...options, imageData: makeImage() }).pattern)
  })

  it('去背景开启后，纯白背景落在 TRANSPARENT 上', () => {
    const src = makeImageWithWhiteBg()
    const result = convertImageToBeadPattern({
      imageData: src,
      targetWidth: 24,
      targetHeight: 24,
      palette: PALETTE,
      removeBg: true,
      ...PATTERN_STYLES.detail,
    })

    const transparent = result.pattern.flat().filter(c => c === 'TRANSPARENT').length
    expect(transparent).toBeGreaterThan(0)
    // 中心红块不该被去背景吃掉
    expect(result.pattern[12][12]).not.toBe('TRANSPARENT')
  })

  it('色号数上限生效：maxColors 越小，图案用到的色号越少', () => {
    const src = makeImage()
    const rich = convertImageToBeadPattern({
      imageData: src,
      targetWidth: 40,
      targetHeight: 40,
      palette: PALETTE,
      ...PATTERN_STYLES.smooth,
    })
    const limited = convertImageToBeadPattern({
      imageData: src,
      targetWidth: 40,
      targetHeight: 40,
      palette: PALETTE,
      ...PATTERN_STYLES.smooth,
      maxColors: 2,
    })

    const countCodes = (pattern: string[][]) =>
      new Set(pattern.flat().filter(c => c !== 'TRANSPARENT')).size

    expect(countCodes(limited.pattern)).toBeLessThanOrEqual(2)
    expect(countCodes(limited.pattern)).toBeLessThanOrEqual(countCodes(rich.pattern))
  })
})

describe('导出尺寸与色号排版', () => {
  it('普通尺寸用理想格 48px', () => {
    expect(calcExportCellSize(52, 52, 3)).toBe(48)
  })

  it('软上限够用时不越过软上限', () => {
    // 150×150：软上限 4500/150 = 30，短色号只需 24px → 直接 30
    expect(calcExportCellSize(150, 150, 2)).toBe(30)
  })

  it('软上限压得色号读不清时，在硬上限内放宽', () => {
    // 400×400：软上限 4500/400 = 11（低于短色号所需的 24px），硬上限 8192/400 = 20
    expect(calcExportCellSize(400, 400, 2)).toBe(20)
    // 长色号需要 48px，400×400 的硬上限只允许 20 —— 取上限值，绘制层会省略色号
    expect(calcExportCellSize(400, 400, 8)).toBe(20)
  })

  it('尺寸永远落在 [4, 48] 且不随行列为 0 而崩', () => {
    for (const [rows, cols, maxLen] of [[1, 1, 1], [52, 104, 2], [500, 500, 6], [2, 300, 8]] as const) {
      const cell = calcExportCellSize(rows, cols, maxLen)
      expect(cell).toBeGreaterThanOrEqual(4)
      expect(cell).toBeLessThanOrEqual(48)
    }
  })

  it('maxCodeLength 取最长色号长度，空图案为 0', () => {
    expect(maxCodeLength([])).toBe(0)
    expect(maxCodeLength([['A1', 'AB-12345']])).toBe(8)
  })

  it('色号越长，能读清所需的最小格子越大（单调不减）', () => {
    expect(minCellForCode(2)).toBeLessThanOrEqual(minCellForCode(8))
    expect(minCellForCode(8)).toBeGreaterThanOrEqual(24)
  })
})

describe('画布线条尺寸（随格子等比缩放）', () => {
  it('正常格子尺寸下缝与线宽都有上限', () => {
    const m = calcBeadLineMetrics(20, 1)
    expect(m.gap).toBeCloseTo(0.5)
    expect(m.cellLineWidth).toBeCloseTo(0.5)
    expect(m.gridLineWidth).toBeCloseTo(1)
  })

  it('格子小于 4px 时不留缝，但辅助网格线仍保 1 画布像素', () => {
    const m = calcBeadLineMetrics(2, 1)
    expect(m.gap).toBe(0)
    expect(m.gridLineWidth).toBe(1)
  })

  it('非法输入退化为 0 而不是 NaN', () => {
    const m = calcBeadLineMetrics(Number.NaN, 0)
    expect(m.gap).toBe(0)
    expect(m.cellLineWidth).toBe(0)
    expect(m.gridLineWidth).toBe(1)
  })
})
