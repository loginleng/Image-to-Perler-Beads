import { describe, it, expect } from 'vitest'
import { encodePattern, decodePattern, decodeProjectData, TRANSPARENT } from '../utils/pattern-codec'

describe('pattern-codec', () => {
  it('encodes and decodes a small pattern round-trip', () => {
    const pattern = [
      ['RD001', 'RD002', 'RD001'],
      ['RD003', 'TRANSPARENT', 'RD002'],
    ]
    const { pattern: encoded, codes } = encodePattern(pattern)
    expect(codes).toEqual(['RD001', 'RD002', 'RD003'])
    // 索引编码：0/1/2 -> base36 '0'/'1'/'2'
    expect(encoded).toEqual([
      ['0', '1', '0'],
      ['2', TRANSPARENT, '1'],
    ])
    expect(decodePattern(encoded, codes)).toEqual(pattern)
  })

  it('supports more than 36 colors (MARD 291)', () => {
    // 构造 >36 个不同颜色，验证索引超出单字符 base36 范围时使用 2 字符
    const colors = Array.from({ length: 40 }, (_, i) => `C${String(i).padStart(3, '0')}`)
    const pattern = [colors]
    const { pattern: encoded, codes: savedCodes } = encodePattern(pattern)
    expect(savedCodes.length).toBe(40)
    expect(encoded[0].length).toBe(40)
    expect(encoded[0][0]).toBe('0')
    expect(encoded[0][2]).toBe('2')
    // 索引 35 -> base36 'z'（单字符上限）
    expect(encoded[0][35]).toBe('z')
    // 索引 39 -> base36 '13'（2 字符）
    expect(encoded[0][39]).toBe('13')
    expect(decodePattern(encoded, savedCodes)).toEqual(pattern)
  })

  it('handles transparent cells and empty values', () => {
    const pattern = [
      [TRANSPARENT, '', 'X1'],
      ['X1', TRANSPARENT, ''],
    ]
    const { pattern: encoded, codes } = encodePattern(pattern)
    expect(encoded[0]).toEqual([TRANSPARENT, TRANSPARENT, '0'])
    expect(decodePattern(encoded, codes)).toEqual([
      [TRANSPARENT, TRANSPARENT, 'X1'],
      ['X1', TRANSPARENT, TRANSPARENT],
    ])
  })

  it('round-trips through JSON serialization (storage shape)', () => {
    const pattern = [
      ['RD001', 'RD002'],
      ['RD003', 'RD001'],
    ]
    const { pattern: encoded, codes } = encodePattern(pattern)
    const stored = JSON.parse(JSON.stringify({ pattern: encoded, codes }))
    expect(decodePattern(stored.pattern, stored.codes)).toEqual(pattern)
  })

  it('decodeProjectData decodes FLAT data in place and removes codes', () => {
    const { pattern: encoded, codes } = encodePattern([['A1', 'B2']])
    const data: any = { pattern: encoded, codes, palette: 'mard' }
    decodeProjectData(data)
    expect(data.pattern).toEqual([['A1', 'B2']])
    expect(data.codes).toBeUndefined()
    expect(data.palette).toBe('mard')
  })

  it('decodeProjectData decodes 3D faces in place', () => {
    const { pattern: encoded, codes } = encodePattern([['A1']])
    const data: any = {
      faces: {
        front: { pattern: encoded, codes, palette: 'mard' },
        empty: { pattern: [], codes: [] },
      },
    }
    decodeProjectData(data)
    expect(data.faces.front.pattern).toEqual([['A1']])
    expect(data.faces.front.codes).toBeUndefined()
  })

  it('leaves legacy data without codes untouched', () => {
    const data: any = { pattern: [['A1', 'B2']], palette: 'mard' }
    decodeProjectData(data)
    expect(data.pattern).toEqual([['A1', 'B2']])
    expect(data.codes).toBeUndefined()
  })

  it('is smaller than raw string[][] for common palette (≤36 colors, 1-char index)', () => {
    // 常用色号（如 RD001），24 色，单字符索引
    const palette = Array.from({ length: 24 }, (_, i) => `RD${String(i).padStart(3, '0')}`)
    const pattern = Array.from({ length: 52 }, (_, y) =>
      Array.from({ length: 52 }, (_, x) => palette[(x + y * 7) % palette.length])
    )
    const raw = JSON.stringify(pattern)
    const { pattern: encoded, codes } = encodePattern(pattern)
    const compressed = JSON.stringify({ pattern: encoded, codes })
    expect(compressed.length).toBeLessThan(raw.length * 0.62)
  })

  it('still compresses with 291-color MARD palette (2-char index)', () => {
    // MARD 风格 6 字符色号，104 宽大图，图案用到 291 色中的 100 种（索引转 2 字符）
    const palette = Array.from({ length: 291 }, (_, i) => `RD${String(i).padStart(3, '0')}`)
    const pattern = Array.from({ length: 78 }, (_, y) =>
      Array.from({ length: 104 }, (_, x) => palette[(x * 13 + y * 17) % 100])
    )
    const raw = JSON.stringify(pattern)
    const { pattern: encoded, codes } = encodePattern(pattern)
    const compressed = JSON.stringify({ pattern: encoded, codes })
    expect(compressed.length).toBeLessThan(raw.length * 0.68)
  })
})
