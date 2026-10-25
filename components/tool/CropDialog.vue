<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    @mousedown.self="emit('cancel')"
  >
    <div class="modern-card p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
      <h3 class="text-lg font-bold text-gray-900 mb-4">{{ $t('tool.crop') }}</h3>

      <!-- 裁剪交互：原图 + 可拖动/缩放选框 -->
      <div
        class="mb-4 rounded-lg border border-gray-200 overflow-auto flex justify-center"
        style="max-height: 600px; padding: 16px; background: repeating-conic-gradient(#f3f4f6 0% 25%, #e5e7eb 0% 50%) 0 0 / 16px 16px;"
      >
        <div class="relative shrink-0" :style="stageStyle">
          <img :src="imageUrl" :style="stageStyle" class="block select-none" draggable="false" alt="" />
          <!-- 裁剪选框：拖动移动，四角缩放；框外区域变暗 -->
          <div
            class="absolute cursor-move touch-none"
            :style="[boxStyle, { boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }]"
            @pointerdown="startDragBox"
          >
            <span
              v-for="h in HANDLES"
              :key="h"
              class="absolute w-3.5 h-3.5 bg-white border border-gray-400 rounded-sm"
              :style="handleStyle(h)"
              @pointerdown.stop="startResizeBox(h, $event)"
            />
          </div>
        </div>
      </div>

      <!-- 裁剪比例 -->
      <div class="mb-4">
        <label class="block text-sm font-semibold text-gray-900 mb-2">{{ $t('tool.cropRatio') }}</label>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="r in RATIOS"
            :key="r.key"
            type="button"
            @click="ratio = r.key"
            :class="[
              'px-3 py-2 rounded-lg text-sm font-medium transition-all text-center',
              ratio === r.key
                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
            ]"
          >{{ r.labelKey ? $t(r.labelKey) : r.label }}</button>
        </div>
      </div>

      <!-- 图片大小（25% - 200%） -->
      <div class="mb-6">
        <label class="block text-sm font-semibold text-gray-900 mb-2">
          {{ $t('tool.cropScale') }}: <span class="font-mono">{{ scale }}%</span>
        </label>
        <input
          v-model.number="scale"
          type="range"
          min="25"
          max="200"
          step="1"
          class="w-full accent-indigo-500 h-1.5 rounded-full appearance-none bg-gray-200 cursor-pointer"
        />
        <p class="text-xs text-gray-500 mt-1">{{ $t('tool.cropScaleHint') }}</p>
      </div>

      <div class="flex justify-end gap-3">
        <button @click="emit('cancel')" class="modern-btn modern-btn-secondary modern-btn-sm">{{ $t('tool.cropCancel') }}</button>
        <button @click="confirm" class="modern-btn modern-btn-primary modern-btn-sm">{{ $t('tool.cropConfirm') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 裁剪弹窗：原图上拖/拉选框，确认后回传裁剪结果的 ImageData 与预览 URL。
// 弹窗自己管选框状态；「打开的是哪张图」由页面给（source），换图才重置选框。
const props = defineProps<{
  open: boolean
  /** 原图画布（裁剪取像素用） */
  source: HTMLCanvasElement | null
  /** 原图 URL（弹窗里显示） */
  imageUrl: string
}>()

const emit = defineEmits<{
  (e: 'confirm', payload: { imageData: ImageData; url: string }): void
  (e: 'cancel'): void
}>()

const RATIOS = [
  { key: 'free', labelKey: 'tool.cropFree' },
  { key: '1:1', label: '1:1' },
  { key: '4:3', label: '4:3' },
  { key: '16:9', label: '16:9' },
]
const HANDLES = ['nw', 'ne', 'sw', 'se'] as const

const scale = ref(100) // 25% - 200%
const ratio = ref('free')

// 裁剪选框（单位：原图像素；可为负值/超出原图 → 超出部分透明留白）
const box = reactive({ x: 0, y: 0, w: 100, h: 100 })

// 原图按最大 420px 等比缩放展示
const fitScale = computed(() => {
  const src = props.source
  if (!src) return 1
  return Math.min(1, 420 / Math.max(src.width, src.height))
})

const stageStyle = computed(() => {
  const src = props.source
  if (!src) return {}
  const f = fitScale.value
  return { width: src.width * f + 'px', height: src.height * f + 'px' }
})

const boxStyle = computed(() => {
  const f = fitScale.value
  return {
    left: box.x * f + 'px',
    top: box.y * f + 'px',
    width: Math.max(0, box.w * f) + 'px',
    height: Math.max(0, box.h * f) + 'px',
  }
})

function handleStyle(h: string) {
  return {
    top: h.includes('n') ? '-5px' : 'auto',
    bottom: h.includes('s') ? '-5px' : 'auto',
    left: h.includes('w') ? '-5px' : 'auto',
    right: h.includes('e') ? '-5px' : 'auto',
    cursor: h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize',
  }
}

// 100% 基准窗口：所选比例在图片内的最大内接矩形（自由=整图）
function computeBaseRect(imgW: number, imgH: number, r: string) {
  let bw = imgW
  let bh = imgH
  if (r !== 'free') {
    const [rw, rh] = r.split(':').map(Number)
    const k = rw / rh
    if (imgW / imgH > k) {
      bh = imgH
      bw = imgH * k
    } else {
      bw = imgW
      bh = imgW / k
    }
  }
  return { w: bw, h: bh }
}

// 比例/缩放变化 → 按基准窗口重新定位（居中），框大小随滑块 25%-200% 缩放
function applyScale() {
  const src = props.source
  if (!src) return
  const base = computeBaseRect(src.width, src.height, ratio.value)
  const s = scale.value / 100
  box.w = base.w * s
  box.h = base.h * s
  box.x = (src.width - box.w) / 2
  box.y = (src.height - box.h) / 2
}

function initBox() {
  scale.value = 100
  ratio.value = 'free'
  applyScale()
}

// 换了底图才重置选框；同一张图重开弹窗时保留上次的选区
let initializedFor: HTMLCanvasElement | null = null
watch(
  () => props.open,
  (open) => {
    if (!open) return
    if (props.source && props.source !== initializedFor) {
      initializedFor = props.source
      initBox()
    }
  },
  { immediate: true }
)

watch([scale, ratio], () => applyScale())

// ==================== 选框拖动 / 缩放 ====================
let drag: {
  mode: 'move' | 'resize'
  handle?: string
  startX: number
  startY: number
  box: { x: number; y: number; w: number; h: number }
} | null = null

function startDragBox(e: PointerEvent) {
  if (e.button !== 0) return
  drag = { mode: 'move', startX: e.clientX, startY: e.clientY, box: { ...box } }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  e.preventDefault()
}

function startResizeBox(handle: string, e: PointerEvent) {
  if (e.button !== 0) return
  drag = { mode: 'resize', handle, startX: e.clientX, startY: e.clientY, box: { ...box } }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  e.preventDefault()
}

function onPointerMove(e: PointerEvent) {
  if (!drag || !props.source) return
  const fit = fitScale.value
  const dx = (e.clientX - drag.startX) / fit
  const dy = (e.clientY - drag.startY) / fit
  const b = drag.box
  const minSize = 8 / fit // 最小 8 显示像素

  if (drag.mode === 'move') {
    box.x = b.x + dx
    box.y = b.y + dy
    return
  }

  const handle = drag.handle!
  let { x, y, w, h } = b
  if (ratio.value === 'free') {
    if (handle.includes('w')) w = Math.max(minSize, b.w - dx)
    if (handle.includes('e')) w = Math.max(minSize, b.w + dx)
    if (handle.includes('n')) h = Math.max(minSize, b.h - dy)
    if (handle.includes('s')) h = Math.max(minSize, b.h + dy)
    if (handle.includes('w')) x = b.x + (b.w - w)
    if (handle.includes('n')) y = b.y + (b.h - h)
  } else {
    // 固定比例：水平方向主导，保持宽高比
    const [rw, rh] = ratio.value.split(':').map(Number)
    const k = rw / rh
    const newW = handle.includes('w') ? Math.max(minSize, b.w - dx) : Math.max(minSize, b.w + dx)
    w = newW
    h = newW / k
    if (handle.includes('w')) x = b.x + (b.w - w)
    if (handle.includes('n')) y = b.y + (b.h - h)
  }
  box.x = x
  box.y = y
  box.w = w
  box.h = h
}

function onPointerUp() {
  if (!drag) return
  drag = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})

// ==================== 确认 ====================
/** 生成裁剪结果画布：原图按选框位置绘制，选框超出原图的部分保持透明（留白，不生成拼豆） */
function buildCropCanvas(): HTMLCanvasElement | null {
  const src = props.source
  if (!src) return null
  const w = Math.max(1, Math.round(box.w))
  const h = Math.max(1, Math.round(box.h))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(src, Math.round(-box.x), Math.round(-box.y))
  return canvas
}

async function confirm() {
  const cropCanvas = buildCropCanvas()
  if (!cropCanvas) return
  const ctx = cropCanvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, cropCanvas.width, cropCanvas.height)
  const url = await new Promise<string>((resolve) => {
    cropCanvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : cropCanvas.toDataURL())
    }, 'image/png')
  })
  emit('confirm', { imageData, url })
}
</script>
