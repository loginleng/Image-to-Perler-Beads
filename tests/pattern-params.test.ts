/**
 * 图纸参数：预设 → 参数组的摊平结果。
 *
 * 这层最容易出的错是「兜底值悄悄改变了某一档的行为」——
 * 比如预设没写 `mergeDeltaE` 表示不合并，兜底若给 16，photo 档就会被默默合并。
 * 所以这里逐项锁住四档的关键值。
 */
import { describe, it, expect } from 'vitest'
import { PATTERN_STYLES, type PatternStyleKey } from '~/utils/bead-algorithm'
import { PARAM_KEYS, paramDiffCount, paramsFromStyle, toConvertOptions } from '~/utils/pattern-params'

const STYLE_KEYS = Object.keys(PATTERN_STYLES) as PatternStyleKey[]

describe('paramsFromStyle', () => {
  it('flat：加权采样 + 强降噪 + 空间/色号合并', () => {
    const p = paramsFromStyle('flat')
    expect(p.sampling).toBe('weighted')
    expect(p.matchAlgorithm).toBe('ciede2000')
    expect(p.denoiseLevel).toBe(2)
    expect(p.regionMergeDeltaE).toBe(4)
    expect(p.mergeDeltaE).toBe(16)
    expect(p.maxColors).toBe(24)
    expect(p.dither).toBe(0)
    expect(p.lineArt).toBe(true)
  })

  it('detail：保留小色块，不做全局合并也不限色号', () => {
    const p = paramsFromStyle('detail')
    expect(p.denoiseLevel).toBe(1)
    expect(p.regionMergeDeltaE).toBe(8)
    expect(p.mergeDeltaE).toBe(0)
    expect(p.maxColors).toBe(36)
  })

  it('smooth：面积平均、不降噪、不做轮廓/特征处理', () => {
    const p = paramsFromStyle('smooth')
    expect(p.sampling).toBe('box')
    expect(p.denoiseLevel).toBe(0)
    expect(p.darkSpotCells).toBe(2)
    expect(p.diagonalLine).toBe(false)
    expect(p.outlineRestore).toBe(false)
    expect(p.featureRestamp).toBe(false)
  })

  it('photo：在 smooth 之上加抖动，且不受色号上限/合约束缚', () => {
    const p = paramsFromStyle('photo')
    expect(p.sampling).toBe('box')
    expect(p.dither).toBeGreaterThan(0)
    expect(p.ditherGate[0]).toBeGreaterThan(1.5) // 预设把闸门抬到 6，平色区不抖
    expect(p.maxColors).toBe(0)
    expect(p.mergeDeltaE).toBe(0)
    expect(p.regionMergeDeltaE).toBe(0)
  })

  it('未知风格退化为默认参数而不是抛错', () => {
    const p = paramsFromStyle('nope')
    expect(p.sampling).toBe('weighted')
    expect(p.denoiseLevel).toBe(1)
  })

  it('每档都返回完整的一组参数（没有 undefined）', () => {
    for (const key of STYLE_KEYS) {
      const p = paramsFromStyle(key) as unknown as Record<string, unknown>
      for (const k of PARAM_KEYS) {
        expect(p[k], `${key}.${k}`).toBeDefined()
      }
    }
  })
})

describe('paramDiffCount', () => {
  it('刚载入预设时为 0', () => {
    for (const key of STYLE_KEYS) {
      expect(paramDiffCount(paramsFromStyle(key), key), key).toBe(0)
    }
  })

  it('改一项就 +1，改回预设恢复 0', () => {
    const preset = paramsFromStyle('flat')
    expect(paramDiffCount({ ...preset, denoiseLevel: 0 }, 'flat')).toBe(1)
    expect(paramDiffCount({ ...preset, ditherGate: [0, 40] }, 'flat')).toBe(1)
    expect(paramDiffCount({ ...preset }, 'flat')).toBe(0)
  })

  it('切到另一档的参数时，相对新预设仍算 0', () => {
    const photo = paramsFromStyle('photo')
    expect(paramDiffCount(photo, 'photo')).toBe(0)
    // 同一组值放到 flat 上就全是差异
    expect(paramDiffCount(photo, 'flat')).toBeGreaterThan(0)
  })
})

describe('toConvertOptions', () => {
  it('原样带出全部字段，且 ditherGate 是拷贝（后续改动不串）', () => {
    const p = paramsFromStyle('photo')
    const opts = toConvertOptions(p)
    expect(opts.ditherGate).not.toBe(p.ditherGate)
    expect(opts.ditherGate).toEqual(p.ditherGate)
    expect(opts.sampling).toBe(p.sampling)
    expect(opts.maxColors).toBe(p.maxColors)
  })
})
