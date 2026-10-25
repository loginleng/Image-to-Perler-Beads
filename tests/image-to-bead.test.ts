import { describe, it, expect } from 'vitest'
import { extractDominantColor, bfsDenoise } from '~/utils/bead-algorithm'
import { findNearestColor, colorDistanceEuclidean } from './helpers/color-utils'

// bfsDenoise 需要「色号 → Lab」表来算色差闸门：只清「与邻域主色的 ΔE 小于闸门」的小簇，
// 闸门默认 8（见 bead-algorithm 的 DEFAULT_MERGE_DELTA_E）。
// 这里给两个 ΔE=2 的色号，保证测的是「按大小清理」这条规则本身，而不是被闸门挡下。
const LABS = new Map([
  ['A', { l: 10, a: 0, b: 0 }],
  ['B', { l: 12, a: 0, b: 0 }],
  ['X', { l: 10, a: 0, b: 0 }],
])

describe('extractDominantColor', () => {
  it('returns the most frequent color', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
      0, 255, 0, 255,
    ])
    const [r, g, b] = extractDominantColor(pixels)
    expect(r).toBeGreaterThan(200)
    expect(g).toBeLessThan(50)
  })

  it('handles empty pixel array without throwing', () => {
    expect(extractDominantColor(new Uint8ClampedArray(0))).toBeDefined()
  })

  it('buckets close colors into the same dominant color', () => {
    // 两个相近的红色（在同一个 bucketSize=8 桶内）应合并为最高频
    const pixels = new Uint8ClampedArray([
      255, 10, 10, 255, 250, 8, 8, 255, 240, 12, 12, 255,
      0, 0, 200, 255,
    ])
    const [r, g, b] = extractDominantColor(pixels)
    expect(r).toBeGreaterThan(200)
    expect(b).toBeLessThan(50)
  })
})

describe('bfsDenoise', () => {
  it('removes small isolated clusters below threshold', () => {
    const pattern = [
      ['A', 'A', 'A'],
      ['A', 'B', 'A'],
      ['A', 'A', 'A'],
    ]
    const result = bfsDenoise(pattern, 3, LABS)
    expect(result[1][1]).toBe('A')
  })

  it('keeps clusters >= threshold unchanged', () => {
    const pattern = [
      ['B', 'B', 'A'],
      ['B', 'B', 'A'],
      ['A', 'A', 'A'],
    ]
    const result = bfsDenoise(pattern, 3, LABS)
    expect(result[0][0]).toBe('B')
    expect(result[1][1]).toBe('B')
  })

  it('handles single-cell pattern', () => {
    const result = bfsDenoise([['X']], 2, LABS)
    expect(result[0][0]).toBe('X')
  })

  it('replaces an edge cluster with its single neighbor color', () => {
    // B 在角落，簇大小 1，邻居是 A
    const pattern = [
      ['B', 'A'],
      ['A', 'A'],
    ]
    const result = bfsDenoise(pattern, 2, LABS)
    expect(result[0][0]).toBe('A')
  })

  it('handles a full-row boundary cluster', () => {
    // 底部一整行 B（簇大小 4），threshold 5 时应替换为 A
    const pattern = [
      ['A', 'A', 'A', 'A'],
      ['A', 'A', 'A', 'A'],
      ['B', 'B', 'B', 'B'],
    ]
    const result = bfsDenoise(pattern, 5, LABS)
    expect(result[2][0]).toBe('A')
    expect(result[2][3]).toBe('A')
  })

  it('does not mutate the input pattern (returns new array)', () => {
    const pattern = [
      ['A', 'A'],
      ['A', 'B'],
    ]
    const before = JSON.stringify(pattern)
    bfsDenoise(pattern, 3, LABS)
    expect(JSON.stringify(pattern)).toBe(before)
  })
})

describe('findNearestColor (image-to-bead conversion core)', () => {
  const palette = [
    { code: 'R', r: 255, g: 0, b: 0 },
    { code: 'G', r: 0, g: 255, b: 0 },
    { code: 'B', r: 0, g: 0, b: 255 },
  ]

  it('maps a red pixel to the RED bead', () => {
    expect(findNearestColor({ r: 250, g: 5, b: 5 }, palette)?.code).toBe('R')
  })

  it('maps green pixel to GREEN', () => {
    expect(findNearestColor({ r: 5, g: 250, b: 5 }, palette)?.code).toBe('G')
  })

  it('supports ciede2000 algorithm', () => {
    const c = findNearestColor({ r: 245, g: 10, b: 10 }, palette, 'ciede2000')
    expect(c?.code).toBe('R')
  })

  it('returns null for empty palette (guard against undefined crash)', () => {
    // 空色板应返回 null，而不是 undefined，避免调用方访问 .code 崩溃
    expect(findNearestColor({ r: 10, g: 10, b: 10 }, [])).toBeNull()
  })
})
