// 珠子画布的线条尺寸：珠缝、珠子描边、辅助网格线。
//
// 这里的核心约束是 —— **线条必须相对格子等比缩放，不能写死像素**。
//
// 格线是「相对格子」才成立的视觉元素。原来珠缝和描边都写死 0.5px，
// 格子缩到 4px 时，每格 0.5 + 0.5(缝) + 0.25×2(描边跨边) ≈ 1.5px，占掉整格的三分之一；
// 于是「越缩小图案，格子之间的线越显眼」，最后盖住图案本身。
//
// 两条硬约束：
//   - **下限 1 画布像素**：再细会被抗锯齿糊成一片灰，比不画还脏；
//   - **上限就是原来的固定值**：保证正常放大时的观感与改动前完全一致。
//
// 与移动端版本同名同口径：
// 那边画布按 dpr 放大绘制，所以传真实 dpr；本项目 2D 画布是 1:1 像素，传 1。

/** 珠缝（每侧）占格子的比例 */
export const BEAD_GAP_RATIO = 0.06
/** 珠子描边宽度占格子的比例 */
export const BEAD_CELL_LINE_RATIO = 0.05
/** 每 10 格一条的辅助网格线宽占格子的比例（参考线，比珠缝更显眼） */
export const BEAD_GRID_LINE_RATIO = 0.12
/** 低于这个格子尺寸就不画缝与描边：格子太小，缝会把整个格子的颜色吃光 */
export const BEAD_GAP_MIN_CELL = 4
/** 导出的「像素对齐」模式用的整数缝宽（不能按比例，否则会破坏整数像素边界） */
export const BEAD_CRISP_GAP = 1

export interface BeadLineMetrics {
  /** 珠与珠之间的缝（每侧）；0 表示不留缝 */
  gap: number
  /** 每个珠子描边的线宽 */
  cellLineWidth: number
  /** 每 10 格一条的辅助网格线线宽 */
  gridLineWidth: number
}

/**
 * 按当前格子尺寸与画布像素比，算出这一帧要用的三种线宽。
 *
 * 珠缝与珠子描边**都不设像素下限**：缩小到子像素时会被抗锯齿自然淡化掉 ——
 * 这正是缩小后想要的（线不该跟图案抢戏）。反过来给个 1px 下限，就等于
 * 把「线随格子等比变细」破坏掉，回到「越缩小线越显眼」的老问题。
 *
 * 只有**辅助网格线**保 1 画布像素的下限：它是「每 10 格」的功能性参考线，
 * 淡到看不见就失去意义了；同时封顶在格子的 12%，不会喧宾夺主。
 *
 * @param cellSize 单个格子的尺寸（px，可为小数）
 * @param dpr      画布像素 / CSS 像素（1:1 绘制的画布传 1）
 */
export function calcBeadLineMetrics(cellSize: number, dpr: number): BeadLineMetrics {
  const safeCell = Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 0
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  const hairline = 1 / Math.max(1, safeDpr)
  return {
    gap: safeCell >= BEAD_GAP_MIN_CELL ? Math.min(0.5, safeCell * BEAD_GAP_RATIO) : 0,
    cellLineWidth: Math.min(0.5, safeCell * BEAD_CELL_LINE_RATIO),
    gridLineWidth: Math.max(hairline, Math.min(1, safeCell * BEAD_GRID_LINE_RATIO))
  }
}
