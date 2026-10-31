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
// dpr 参数：画布按 dpr 放大绘制（高分屏 1 格 = dpr 个物理像素）时传真实 dpr，
// 让「1 画布像素的下限」换算成物理像素；本项目预览/导出都是 1:1 像素，传 1。

/**
 * 画布底色 / 空格子颜色：纯白。
 * 只影响「没有珠子」的地方（珠子颜色、默认画笔色都不受影响）。
 * 空格子靠一层「逐格细网格」勾出边界，保证空白区域也能看清一个个格子。
 */
export const CANVAS_BG = '#FFFFFF'

/** 逐格细网格的颜色与最小可绘格子（再小就糊成灰底，不如不画） */
export const FINE_GRID_COLOR = 'rgba(0,0,0,0.14)'
export const FINE_GRID_MIN_CELL = 3

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

/** 坐标留白宽度（px）：显示坐标时，图纸四周留给行列数字的空间 */
export const GUIDE_MARGIN = 36

export interface GuideOverlayOptions {
  cols: number
  rows: number
  /** 单格尺寸（px） */
  cellSize: number
  /** 整张画布宽高（含四周留白） */
  canvasW: number
  canvasH: number
  /** 四周留白宽度；0 = 不显示坐标 */
  guideMargin: number
  showGrid: boolean
  showCoords: boolean
  coordFontSize?: number
  /** 每 N 格标一个坐标数字（辅助网格线固定每 10 格，不受此影响） */
  labelStep?: number
}

/**
 * 在画布上叠加「每 10 格辅助网格 + 四周行列坐标」。
 * 预览与导出共用同一份实现，避免两边标尺对不上。
 */
export function drawGuideOverlay(ctx: CanvasRenderingContext2D, o: GuideOverlayOptions) {
  const {
    cols, rows, cellSize, canvasW, canvasH, guideMargin,
    showGrid, showCoords, coordFontSize = 12, labelStep = 10
  } = o

  // 辅助网格：每 10 格一条深色线（只画在珠子区域内，避免与坐标留白区的数字重叠）
  if (showGrid) {
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    // 线宽按格子等比缩放：写死 1px 时，缩到 25% 会让线比格子还粗
    ctx.lineWidth = calcBeadLineMetrics(cellSize, 1).gridLineWidth
    for (let i = 10; i <= cols; i += 10) {
      const x = guideMargin + i * cellSize
      ctx.beginPath()
      ctx.moveTo(x, guideMargin)
      ctx.lineTo(x, canvasH - guideMargin)
      ctx.stroke()
    }
    for (let j = 10; j <= rows; j += 10) {
      const y = guideMargin + j * cellSize
      ctx.beginPath()
      ctx.moveTo(guideMargin, y)
      ctx.lineTo(canvasW - guideMargin, y)
      ctx.stroke()
    }
  }

  // 坐标：四面标注，起点标 1，此后每个 labelStep 格边界标一次
  if (showCoords) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.font = `${coordFontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // 列坐标：顶部 & 底部
    for (let pos = 0; pos <= cols; pos += labelStep) {
      const label = pos === 0 ? '1' : String(pos)
      const x = guideMargin + pos * cellSize
      ctx.fillText(label, x, guideMargin / 2)
      ctx.fillText(label, x, canvasH - guideMargin / 2)
    }
    // 行坐标：左侧 & 右侧
    for (let pos = 0; pos <= rows; pos += labelStep) {
      const label = pos === 0 ? '1' : String(pos)
      const y = guideMargin + pos * cellSize
      ctx.fillText(label, guideMargin / 2, y)
      ctx.fillText(label, canvasW - guideMargin / 2, y)
    }
  }
}
