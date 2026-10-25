// 导出成品图：图纸 + 辅助网格/坐标 + 底部颜色统计区，整张拼成一个 PNG 下载。
//
// 这里只做「画布怎么拼」，不碰 Vue 状态：预览用同样的 drawGuideOverlay，
// 保证屏幕上的标尺与导出的图纸一致。
import {
  calcExportCellSize,
  createBeadCanvas,
  fitTextFontSize,
  maxCodeLength,
  type BeadStyle,
  type ColorStat
} from './bead-algorithm'
import { drawGuideOverlay, GUIDE_MARGIN } from './bead-canvas'
import type { BeadColor } from '~/types'

/** 导出格子优先 48px（色号清晰可读），超长图纸自动缩小避免画布过大 */
const EXPORT_CELL_SIZE = 48
/** 软上限：超过就回缩，避免导出图大到打不开 */
const EXPORT_CANVAS_CAP = 4500
/** 硬上限：色号读不清时允许放宽到这里，保证长色号仍导得出来 */
const EXPORT_CANVAS_MAX = 8192

export interface ExportPatternOptions {
  pattern: string[][]
  colors: BeadColor[]
  beadStyle: BeadStyle
  stats: ColorStat[]
  /** 是否把每 10 格的辅助网格画进导出图（跟随界面开关） */
  showGrid: boolean
  /** 是否把四周坐标一并画进导出图（跟随界面开关） */
  showCoords: boolean
  labelStep: number
  /** 统计区标题（i18n 文案由调用方传入） */
  statsTitle: string
  /** 统计区「颗」的单位（i18n 文案由调用方传入） */
  beadUnit?: string
}

export interface StatLayout {
  pad: number
  titleH: number
  gap: number
  colCount: number
  cellW: number
  cellH: number
  rowCount: number
  statH: number
}

/** 统计区布局：仿编辑 Tab 的 grid（auto-fill minmax）——每行尽量多放格子，总高限 800px */
export function getStatLayout(W: number, stats: { colorCode: string }[]): StatLayout {
  const pad = 16
  const titleH = 40
  const gap = 6
  const minCellW = 84
  let cellH = 92
  const count = (stats && stats.length) || 0
  // 没有色号时不画统计区（调用方只关心 statH）
  if (!count) return { pad, titleH, gap, colCount: 1, cellW: 0, cellH, rowCount: 0, statH: 0 }
  // 每行格数 = 宽度能放下多少个「最小宽 + 间距」的格子
  const colCount = Math.max(1, Math.floor((W - pad * 2 + gap) / (minCellW + gap)))
  const cellW = (W - pad * 2 - gap * (colCount - 1)) / colCount
  const rowCount = Math.ceil(count / colCount)
  let statH = titleH + pad * 2 + rowCount * cellH + (rowCount - 1) * gap
  // 颜色极多时压缩格子高度，避免统计区过高导致画布过大
  if (statH > 800) {
    cellH = Math.max(56, Math.floor((800 - titleH - pad * 2) / rowCount))
    statH = titleH + pad * 2 + rowCount * cellH + (rowCount - 1) * gap
  }
  return { pad, titleH, gap, colCount, cellW, cellH, rowCount, statH }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 图纸底部的颜色统计块：圆角格子（圆色块 + 色号 + 数量） */
export function drawStatBlock(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  stats: ColorStat[],
  title: string,
  beadUnit = ''
) {
  if (!stats || !stats.length) return
  const { pad, titleH, gap, colCount, cellW, cellH, statH } = getStatLayout(W, stats)
  // 白色背景
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, H, W, statH)
  // 图纸与统计区之间分隔线
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, H + 0.5)
  ctx.lineTo(W, H + 0.5)
  ctx.stroke()
  // 标题
  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, pad, H + pad + titleH / 2)
  // 每个格子：圆角浅灰背景 + 圆色块 + 色号 + 数量
  const sw = 30
  stats.forEach((s, i) => {
    const col = i % colCount
    const row = Math.floor(i / colCount)
    const gx = pad + col * (cellW + gap)
    const gy = H + pad + titleH + row * (cellH + gap)
    const cx = gx + cellW / 2
    // 格子背景
    roundRectPath(ctx, gx, gy, cellW, cellH, 8)
    ctx.fillStyle = '#FAFAFA'
    ctx.fill()
    // 圆色块
    ctx.beginPath()
    ctx.arc(cx, gy + 8 + sw / 2, sw / 2, 0, Math.PI * 2)
    ctx.fillStyle = s.hex
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.stroke()
    // 色号：长度因品牌而异（长色号是 8 字符），按卡片宽度自适应，避免压到相邻卡片
    ctx.fillStyle = '#333333'
    ctx.font = `bold ${fitTextFontSize(ctx, s.colorCode, 14, cellW - 16)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(s.colorCode, cx, gy + 8 + sw + 5 + 7)
    // 数量
    ctx.fillStyle = '#999999'
    ctx.font = '12px sans-serif'
    ctx.fillText(`${s.count}${beadUnit}`, cx, gy + 8 + sw + 7 + 15 + 6)
  })
}

/** 把图纸渲染成一张成品图（不下载，便于测试或二次处理） */
export function renderExportCanvas(o: ExportPatternOptions): HTMLCanvasElement {
  const { pattern, colors, beadStyle, stats, showGrid, showCoords, labelStep, statsTitle, beadUnit = '' } = o
  const cols = pattern[0].length
  const rows = pattern.length

  // 整体放大：优先 48px 格子（色号可读），超出画布上限时按比例缩小（下限 4px）。
  // 色号越长，能读清所需的最小格子越大（8 字符色号要 48px，短色号 24px 就够），
  // 所以这条决策要看图案里最长的色号 —— 否则大图纸会把色号整片省略，等于白导。
  const cellSize = calcExportCellSize(rows, cols, maxCodeLength(pattern), {
    idealCell: EXPORT_CELL_SIZE,
    softCap: EXPORT_CANVAS_CAP,
    hardCap: EXPORT_CANVAS_MAX
  })

  const guideMargin = showCoords ? GUIDE_MARGIN : 0
  const beadCanvas = createBeadCanvas(pattern, colors, cellSize, beadStyle, true /* 色号 */, true /* 整数像素对齐 */)

  const canvasW = cols * cellSize + guideMargin * 2
  const canvasH = rows * cellSize + guideMargin * 2
  const { statH } = getStatLayout(canvasW, stats)

  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = canvasW
  exportCanvas.height = canvasH + statH
  const ctx = exportCanvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#F0F0F0'
  ctx.fillRect(0, 0, canvasW, canvasH)
  ctx.drawImage(beadCanvas, guideMargin, guideMargin)

  // 辅助网格 + 坐标（跟随开关，字号比预览大一号，方便打印看清）
  drawGuideOverlay(ctx, {
    cols, rows, cellSize, canvasW, canvasH, guideMargin,
    showGrid,
    showCoords,
    coordFontSize: 16,
    labelStep
  })
  if (statH > 0) drawStatBlock(ctx, canvasW, canvasH, stats, statsTitle, beadUnit)

  return exportCanvas
}

/** 生成成品图并触发浏览器下载 */
export function exportPatternPng(o: ExportPatternOptions) {
  const canvas = renderExportCanvas(o)
  const link = document.createElement('a')
  link.download = `bead-pattern-${o.beadStyle}.png`
  link.href = canvas.toDataURL()
  link.click()
}
