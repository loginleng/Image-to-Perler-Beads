/**
 * 导出布局的纯计算部分（统计区排版）。
 * 真正画到 canvas 的那步需要 DOM，这里只锁「尺寸算得对不对」——
 * 算错的表现是统计区被裁掉或留一大片空白，肉眼很难发现。
 */
import { describe, it, expect } from 'vitest'
import { getStatLayout } from '~/utils/bead-export'

const stats = (n: number) => Array.from({ length: n }, (_, i) => ({ colorCode: `S${i}` }))

describe('getStatLayout', () => {
  it('没有色号时高度为 0（不画统计区）', () => {
    const layout = getStatLayout(1000, [])
    expect(layout.statH).toBe(0)
    expect(layout.rowCount).toBe(0)
  })

  it('单行：列宽把整行铺满，总高 = 标题 + 上下留白 + 一格', () => {
    const layout = getStatLayout(1000, stats(3))
    expect(layout.colCount).toBeGreaterThanOrEqual(3)
    expect(layout.rowCount).toBe(1)
    expect(layout.statH).toBe(layout.titleH + layout.pad * 2 + layout.cellH)
    // 每行固定按「最多能放几列」铺满（色号少时右侧留着空位）
    const filled = layout.cellW * layout.colCount + layout.gap * (layout.colCount - 1) + layout.pad * 2
    expect(filled).toBeCloseTo(1000, 5)
  })

  it('色号越多行数越多，高度随行数增长', () => {
    const few = getStatLayout(600, stats(4))
    const many = getStatLayout(600, stats(40))
    expect(many.rowCount).toBeGreaterThan(few.rowCount)
    expect(many.statH).toBeGreaterThan(few.statH)
  })

  it('极多色号时先压格子高度，压到 56px 就不再压（宁可超高）', () => {
    const layout = getStatLayout(600, stats(300))
    expect(layout.rowCount).toBeGreaterThan(10)
    expect(layout.cellH).toBe(56)
    const expected = layout.titleH + layout.pad * 2 + layout.rowCount * layout.cellH + (layout.rowCount - 1) * layout.gap
    expect(layout.statH).toBe(expected)
  })

  it('列数至少 1（画布极窄时也不除零）', () => {
    const layout = getStatLayout(50, stats(2))
    expect(layout.colCount).toBe(1)
    expect(Number.isFinite(layout.cellW)).toBe(true)
  })
})
