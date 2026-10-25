<template>
  <!-- Canvas Container。
       注意：这里用固定 padding 提供四周留白，而不是 flex+margin:auto 居中——
       交互式画布的「以鼠标为锚点缩放」依赖 scrollLeft 精确锚定，
       其公式假设滚动内容固定在容器起点（margin=0）；
       若改用 margin:auto 居中，画布位置会随尺寸动态变化，导致锚点失效（缩放跳回左上角）。 -->
  <div
    ref="containerEl"
    class="relative bg-gray-50 rounded-xl border border-gray-200 overflow-auto select-none cursor-grab active:cursor-grabbing"
    style="width: 100%; height: 600px; padding: 24px;"
    @wheel.prevent="onWheelZoom"
    @mousedown="onContainerMouseDown"
  >
    <!-- Loading overlay -->
    <div v-if="processing && hasImage" class="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
      <div class="flex flex-col items-center gap-3">
        <div class="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <span class="text-sm font-medium text-indigo-600">{{ $t('tool.processing') }}</span>
      </div>
    </div>
    <!-- Empty state -->
    <div v-if="!hasImage" class="absolute inset-0 flex items-center justify-center z-10">
      <div class="text-center">
        <svg class="w-16 h-16 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p class="text-sm text-gray-400">{{ $t('tool.previewEmpty') }}</p>
      </div>
    </div>
    <!-- Canvas：包裹层承担缩放后的布局尺寸，canvas 直接以自身像素尺寸显示，
         无 CSS transform 缩放，避免亚像素抖动 -->
    <div :style="wrapStyle" class="relative">
      <canvas
        ref="canvasEl"
        :class="[canvasClass, tool !== 'none' ? 'cursor-cell' : 'cursor-crosshair']"
        :style="canvasStyle"
        @click="onCanvasClick"
        @mousedown="onCanvasMouseDown"
        @mousemove="onCanvasMouseMove"
        @mouseleave="hoverTip = null"
      />
    </div>

    <!-- 色号悬停提示：Teleport 到 body + fixed 定位，避免被容器 overflow/z-index 遮挡 -->
    <Teleport to="body">
      <div
        v-if="hoverTip"
        class="fixed z-[9999] pointer-events-none px-2 py-1 rounded-md bg-gray-900/90 text-white text-xs shadow-lg whitespace-nowrap"
        :style="{ left: hoverTip.x + 'px', top: hoverTip.y + 'px', transform: 'translate(12px, 12px)' }"
      >{{ hoverTip.text }}</div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
// 预览画布：把「图纸 + 辅助网格/坐标」画到 canvas，并负责视口交互
// （滚轮缩放、拖动平移、鼠标悬停色号、画笔/橡皮/替色的落点换算）。
//
// 组件只读 pattern：涂画不在这里改数据，而是把命中的格子 emit 给页面，
// 由页面统一改 pattern / 重算统计 / 存草稿，保证「一个数据源」。
import type { CSSProperties } from 'vue'
import { createBeadCanvas, type BeadStyle } from '~/utils/bead-algorithm'
import { drawGuideOverlay, GUIDE_MARGIN } from '~/utils/bead-canvas'
import type { BeadColor } from '~/types'

const props = withDefaults(defineProps<{
  /** 图纸色号矩阵；null = 还没有任何画布 */
  pattern: string[][] | null
  /** 当前色板（用于找色块颜色与色号名称） */
  colors: BeadColor[]
  beadStyle: BeadStyle
  /** 单格像素（由页面按缩放算好） */
  cellSize: number
  /** 当前缩放百分比（滚轮以它为步进基准） */
  zoom?: number
  /** 当前工具：none = 只选色；brush/eraser/replace = 落笔 */
  tool: 'none' | 'brush' | 'eraser' | 'replace'
  brushColor?: string
  brushSize?: number
  showGrid?: boolean
  showCoords?: boolean
  labelStep?: number
  /** 内容变化信号：页面每次改图案后自增，用于让渲染缓存失效 */
  renderToken: number
  processing?: boolean
  hasImage?: boolean
}>(), {
  brushColor: '',
  brushSize: 1,
  zoom: 100,
  showGrid: true,
  showCoords: true,
  labelStep: 10,
  processing: false,
  hasImage: false,
})

const emit = defineEmits<{
  (e: 'update:zoom', value: number): void
  /** 一笔开始：页面据此压入撤销快照 */
  (e: 'stroke-start'): void
  /** 落笔：命中的格子 + 要写入的色号 */
  (e: 'paint', payload: { cells: { x: number; y: number }[]; code: string }): void
  /** 非涂画模式下点击格子：页面弹出整体替换 */
  (e: 'select-color', code: string): void
}>()

const containerEl = ref<HTMLDivElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

// 已渲染内容尺寸（canvas 像素尺寸，不含任何 transform）
const renderedW = ref(0)
const renderedH = ref(0)

const wrapStyle = computed(() => ({
  width: `${renderedW.value}px`,
  height: `${renderedH.value}px`,
}))

const canvasStyle: CSSProperties = {
  'image-rendering': 'pixelated',
  position: 'absolute',
  left: '0',
  top: '0',
}

const canvasClass = computed(() => ({ 'opacity-30': props.processing }))

const paintCode = computed(() => (props.tool === 'eraser' ? 'TRANSPARENT' : props.brushColor))

// ==================== 渲染 ====================
let lastRenderKey = ''
let lastRenderedCellSize = -1

function renderKeyOf() {
  return [
    props.renderToken,
    props.cellSize,
    props.beadStyle,
    props.showGrid,
    props.showCoords,
    props.labelStep,
    props.pattern?.length ?? 0,
    props.pattern?.[0]?.length ?? 0,
  ].join('|')
}

function render() {
  const canvas = canvasEl.value
  const pattern = props.pattern
  if (!canvas || !pattern?.length) return

  const cellSize = props.cellSize
  const renderKey = renderKeyOf()
  if (renderKey === lastRenderKey) return
  lastRenderKey = renderKey

  // 仅当格大小变化时按图片中心锚定视口（颜色替换等重绘不打断用户浏览位置）
  const cellSizeChanged = cellSize !== lastRenderedCellSize
  lastRenderedCellSize = cellSize
  const oldW = renderedW.value
  const oldH = renderedH.value

  const cols = pattern[0].length
  const rows = pattern.length
  const margin = props.showCoords ? GUIDE_MARGIN : 0

  const beadCanvas = createBeadCanvas(pattern, props.colors, cellSize, props.beadStyle, false /* 预览不显示色号 */)

  const canvasW = cols * cellSize + margin * 2
  const canvasH = rows * cellSize + margin * 2
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#F0F0F0'
  ctx.fillRect(0, 0, canvasW, canvasH)
  ctx.drawImage(beadCanvas, margin, margin)

  drawGuideOverlay(ctx, {
    cols,
    rows,
    cellSize,
    canvasW,
    canvasH,
    guideMargin: margin,
    showGrid: props.showGrid,
    showCoords: props.showCoords,
    coordFontSize: 12,
    labelStep: props.labelStep,
  })

  renderedW.value = canvasW
  renderedH.value = canvasH

  // 格大小变化时的视口锚定（重绘完成后调整滚动，保证缩放以鼠标/中心为锚）：
  // - 鼠标滚轮缩放（800ms 内）：以鼠标位置为锚点，按画布尺寸变化比例平移滚动，
  //   让鼠标下的内容点在缩放后仍停留在鼠标位置
  // - 滑块缩放 / 初次渲染：保持图片中心在可视区中心
  if (!cellSizeChanged) return
  const el = containerEl.value
  const keepViewport = wheelZoomAt > 0 && Date.now() - wheelZoomAt < 800
  if (keepViewport && wheelCursor && oldW > 0 && oldH > 0 && el) {
    const ratioW = canvasW / oldW
    const ratioH = canvasH / oldH
    el.scrollLeft = (el.scrollLeft + wheelCursor.x) * ratioW - wheelCursor.x
    el.scrollTop = (el.scrollTop + wheelCursor.y) * ratioH - wheelCursor.y
  } else {
    requestAnimationFrame(() => {
      if (!el) return
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
    })
  }
}

watch(
  () => [props.renderToken, props.cellSize, props.beadStyle, props.showGrid, props.showCoords, props.labelStep],
  () => render()
)

onMounted(() => render())

// ==================== 滚轮缩放 ====================
// 记录最近一次滚轮缩放时鼠标相对预览容器的偏移，供「以鼠标位置为锚点缩放」使用
let wheelCursor: { x: number; y: number } | null = null
let wheelZoomAt = 0

function onWheelZoom(event: WheelEvent) {
  // 指数步进（每次 ±10%）：缩放过程连续平滑，格子大小随之按比例变化，
  // 不会像线性步进那样在大图纸上出现「转一格但格子大小不变」的 dead zone
  const factor = event.deltaY > 0 ? 1 / 1.1 : 1.1
  const el = containerEl.value
  if (el) {
    const rect = el.getBoundingClientRect()
    // 容器有 padding（四周留白），鼠标偏移必须换算为内容区坐标系（与 scrollLeft 一致），
    // 否则缩放锚点会偏移 padding 距离，导致「缩放没对准鼠标」
    const cs = getComputedStyle(el)
    const padLeft = parseFloat(cs.paddingLeft) || 0
    const padTop = parseFloat(cs.paddingTop) || 0
    wheelCursor = {
      x: event.clientX - rect.left - padLeft,
      y: event.clientY - rect.top - padTop,
    }
    wheelZoomAt = Date.now()
  }
  const next = Math.max(25, Math.min(300, Math.round(props.zoom * factor * 10) / 10))
  emit('update:zoom', next)
}

// ==================== 拖动平移 ====================
// 按住预览区域（含四周留白）拖动即可平移视口；拖动过阈值时抑制画布点击选色
let dragState: { startX: number; startY: number; scrollLeft: number; scrollTop: number; moved: boolean } | null = null
let suppressClick = false

function onContainerMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  // 涂画模式下禁止拖拽平移，避免与涂画手势冲突
  if (props.tool === 'brush' || props.tool === 'eraser') return
  const el = containerEl.value
  if (!el) return
  dragState = {
    startX: e.clientX,
    startY: e.clientY,
    scrollLeft: el.scrollLeft,
    scrollTop: el.scrollTop,
    moved: false,
  }
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
  e.preventDefault()
}

function onWindowMouseMove(e: MouseEvent) {
  if (!dragState) return
  const dx = e.clientX - dragState.startX
  const dy = e.clientY - dragState.startY
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.moved = true
  if (dragState.moved) {
    const el = containerEl.value
    if (el) {
      el.scrollLeft = dragState.scrollLeft - dx
      el.scrollTop = dragState.scrollTop - dy
    }
  }
}

function onWindowMouseUp() {
  if (!dragState) return
  if (dragState.moved) suppressClick = true
  dragState = null
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
}

// ==================== 鼠标 → 格子 ====================
/** 色号 → 名称查找表（悬停提示用） */
const colorMap = computed(() => {
  const map = new Map<string, { code: string; name: string }>()
  for (const c of props.colors) map.set(c.code, { code: c.code, name: c.name || '' })
  return map
})

/** 鼠标位置换算成格子坐标；落在图纸外返回 null */
function cellAt(e: MouseEvent): { x: number; y: number } | null {
  const canvas = canvasEl.value
  const pattern = props.pattern
  if (!canvas || !pattern?.length) return null
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  // 减去坐标留白映射到画布坐标（canvas 以自身像素尺寸显示，无缩放变换）
  const margin = props.showCoords ? GUIDE_MARGIN : 0
  const gx = Math.floor((e.clientX - rect.left - margin) / props.cellSize)
  const gy = Math.floor((e.clientY - rect.top - margin) / props.cellSize)
  const rows = pattern.length
  const cols = pattern[0].length
  if (gy < 0 || gy >= rows || gx < 0 || gx >= cols) return null
  return { x: gx, y: gy }
}

/** 按笔刷大小展开成要涂的格子集合（替色不跟笔刷大小走） */
function cellsFor(cell: { x: number; y: number }): { x: number; y: number }[] {
  const pattern = props.pattern!
  const rows = pattern.length
  const cols = pattern[0].length
  const radius = props.tool === 'replace' ? 0 : Math.floor(props.brushSize / 2)
  const cells: { x: number; y: number }[] = []
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cy = cell.y + dy
      const cx = cell.x + dx
      if (cy < 0 || cy >= rows || cx < 0 || cx >= cols) continue
      cells.push({ x: cx, y: cy })
    }
  }
  return cells
}

// ==================== 悬停提示 ====================
const hoverTip = ref<{ x: number; y: number; text: string } | null>(null)

function updateHoverTip(e: MouseEvent) {
  const cell = cellAt(e)
  if (!cell) {
    hoverTip.value = null
    return
  }
  const code = props.pattern![cell.y][cell.x]
  if (!code || code === 'TRANSPARENT') {
    hoverTip.value = null
    return
  }
  const bead = colorMap.value.get(code)
  const text = bead ? `${bead.code}${bead.name ? ' · ' + bead.name : ''}` : code
  // 用视口坐标（fixed 定位 + Teleport），避免被容器 overflow/z-index 裁剪
  hoverTip.value = { x: e.clientX, y: e.clientY, text }
}

// ==================== 点击选色 / 涂画 ====================
function onCanvasClick(e: MouseEvent) {
  // 涂画类模式下点击已由 mousedown 完成，这里直接忽略
  if (props.tool !== 'none') return
  // 拖动结束后的点击不触发选色
  if (suppressClick) {
    suppressClick = false
    return
  }
  const cell = cellAt(e)
  if (!cell) return
  const code = props.pattern![cell.y][cell.x]
  // 点画布选色只作为「整体替换」的快捷入口；透明格没有可替换的颜色
  if (code && code !== 'TRANSPARENT') emit('select-color', code)
}

let paintingStroke = false

function onCanvasMouseDown(e: MouseEvent) {
  if (props.tool === 'none' || e.button !== 0) return
  if (!props.pattern?.length) return
  // 画笔 / 替色还没拿到有效颜色时不要落笔
  if (props.tool !== 'eraser' && !props.brushColor) return
  // 点在画布留白 / 图外：不开始这一笔（否则会压入一个什么都没改的撤销快照）
  const cell = cellAt(e)
  if (!cell) return
  e.preventDefault()
  e.stopPropagation() // 阻止容器拖拽平移
  if (!paintingStroke) {
    paintingStroke = true
    emit('stroke-start')
  }
  emit('paint', { cells: cellsFor(cell), code: paintCode.value })
  window.addEventListener('mousemove', onBrushMouseMove)
  window.addEventListener('mouseup', onBrushMouseUp)
}

function onCanvasMouseMove(e: MouseEvent) {
  updateHoverTip(e)
}

function onBrushMouseMove(e: MouseEvent) {
  if (!paintingStroke) return
  const cell = cellAt(e)
  if (!cell) return
  emit('paint', { cells: cellsFor(cell), code: paintCode.value })
}

function onBrushMouseUp() {
  if (!paintingStroke) return
  paintingStroke = false
  window.removeEventListener('mousemove', onBrushMouseMove)
  window.removeEventListener('mouseup', onBrushMouseUp)
}

// ==================== 对外方法 ====================
/** 强制重绘（清空画布后绕过渲染缓存） */
function invalidate() {
  lastRenderKey = ''
  render()
}

/** 回到左上角（清空画布时用，避免沿用旧滚动位置） */
function resetView() {
  invalidate()
  requestAnimationFrame(() => {
    const el = containerEl.value
    if (!el) return
    el.scrollLeft = 0
    el.scrollTop = 0
  })
}

defineExpose({ invalidate, resetView })

// ==================== 清理 ====================
onUnmounted(() => {
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
  window.removeEventListener('mousemove', onBrushMouseMove)
  window.removeEventListener('mouseup', onBrushMouseUp)
})
</script>
