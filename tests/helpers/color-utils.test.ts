import { describe, it, expect } from 'vitest'
import { findNearestColor, colorDistanceEuclidean } from './color-utils'

const palette = [
  { code: 'RED', r: 255, g: 0, b: 0 },
  { code: 'GREEN', r: 0, g: 255, b: 0 },
  { code: 'BLUE', r: 0, g: 0, b: 255 },
  { code: 'BLACK', r: 0, g: 0, b: 0 },
  { code: 'WHITE', r: 255, g: 255, b: 255 },
]

describe('colorDistanceEuclidean', () => {
  it('returns 0 for identical colors', () => {
    expect(colorDistanceEuclidean({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 })).toBe(0)
  })

  it('computes distance correctly', () => {
    expect(colorDistanceEuclidean({ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 3 })).toBe(3)
  })
})

describe('findNearestColor', () => {
  it('finds exact match', () => {
    expect(findNearestColor({ r: 255, g: 0, b: 0 }, palette)?.code).toBe('RED')
  })

  it('finds nearest for dark color', () => {
    expect(findNearestColor({ r: 10, g: 10, b: 10 }, palette)?.code).toBe('BLACK')
  })

  it('uses ciede2000 algorithm without throwing', () => {
    const result = findNearestColor({ r: 200, g: 50, b: 50 }, palette, 'ciede2000')
    expect(result?.code).toBe('RED')
  })

  it('returns first palette entry for empty-distance ties', () => {
    expect(findNearestColor({ r: 0, g: 0, b: 0 }, [{ code: 'A', r: 0, g: 0, b: 0 }])?.code).toBe('A')
  })
})
