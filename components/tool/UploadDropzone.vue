<template>
  <div>
    <!-- 上传区：点击/拖拽选择图片 -->
    <div
      @drop.prevent="handleDrop"
      @dragover.prevent
      @click="triggerUpload"
      class="border-2 border-dashed border-indigo-200 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group"
    >
      <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="handleFileSelect" />
      <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center group-hover:from-indigo-200 group-hover:to-purple-200 transition-all">
        <svg class="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>
      <p class="text-sm font-medium text-gray-700 mb-1">{{ $t('tool.dragDrop') }}</p>
      <p class="text-xs text-gray-500">{{ $t('tool.supportedFormats') }}</p>
    </div>

    <!--
      原图预览：独立可交互区域。
      拖动平移、滚轮以光标为锚点缩放、双击复位；右上角保留裁剪 / 移除。
      与右侧拼豆预览一样按「视口 + transform」实现，图片本身不参与布局。
    -->
    <div v-if="previewUrl" class="mt-4">
      <div
        ref="viewportEl"
        class="relative h-60 rounded-lg overflow-hidden bg-gray-100 cursor-grab active:cursor-grabbing select-none"
        style="background-image: repeating-conic-gradient(#f3f4f6 0% 25%, #e5e7eb 0% 50%); background-size: 16px 16px;"
        @wheel.prevent="onWheel"
        @mousedown="onMouseDown"
        @dblclick="resetView"
        @dragstart.prevent
      >
        <img
          ref="imgEl"
          :src="croppedPreviewUrl || previewUrl"
          alt="Preview"
          draggable="false"
          class="absolute left-0 top-0 max-w-none pointer-events-none select-none"
          :style="imageStyle"
          @load="onImageLoad"
        />

        <!-- 顶部操作：裁剪 / 移除 -->
        <div class="absolute top-2 right-2 z-10 flex items-center gap-1.5">
          <button
            type="button"
            class="px-2.5 py-1 rounded-md bg-white/95 text-xs font-medium text-gray-700 shadow-sm hover:text-indigo-600 transition-colors"
            :aria-label="$t('tool.recrop')"
            @mousedown.stop
            @click.stop="$emit('crop')"
          >{{ $t('tool.recrop') }}</button>
          <button
            type="button"
            class="w-7 h-7 rounded-full bg-white/95 shadow-sm flex items-center justify-center text-gray-600 hover:bg-red-50 hover:text-red-500 transition-all"
            @mousedown.stop
            @click.stop="$emit('clear')"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- 缩放控制条 -->
        <div
          class="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white/95 px-1 py-0.5 shadow-sm"
          @mousedown.stop
          @wheel.stop
        >
          <button type="button" class="w-6 h-6 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 font-semibold" @click.stop="zoomBy(-1)">−</button>
          <span class="min-w-[3rem] text-center text-xs font-semibold text-gray-700 tabular-nums">{{ zoomPercent }}%</span>
          <button type="button" class="w-6 h-6 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 font-semibold" @click.stop="zoomBy(1)">+</button>
          <button type="button" class="px-1.5 py-0.5 text-xs font-semibold text-gray-500 hover:text-indigo-600" @click.stop="resetView">{{ $t('tool.reset') }}</button>
        </div>

        <span class="pointer-events-none absolute bottom-2 left-2 rounded bg-black/45 px-2 py-0.5 text-[10px] text-white/90">
          {{ $t('tool.imagePreviewHint') }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  previewUrl: string
  croppedPreviewUrl?: string
}>()

const emit = defineEmits<{
  (e: 'file', file: File): void
  (e: 'clear'): void
  /** 点击缩略图：重新打开裁剪弹窗 */
  (e: 'crop'): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const viewportEl = ref<HTMLDivElement | null>(null)
const imgEl = ref<HTMLImageElement | null>(null)

// 图片展示缩放：100% = 适配视口，1:1 按钮回到适配状态（PC 预览以「看全」为默认）
const scale = ref(1)
const fitScale = ref(1)
const panX = ref(0)
const panY = ref(0)
const ZOOM_MIN = 0.1
const ZOOM_MAX = 8

const imageStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${scale.value})`,
  transformOrigin: '0 0'
}))

const zoomPercent = computed(() => Math.round((scale.value / (fitScale.value || 1)) * 100))

function triggerUpload() {
  fileInput.value?.click()
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files?.[0]) {
    emit('file', target.files[0])
  }
}

function handleDrop(e: DragEvent) {
  if (e.dataTransfer?.files[0]) {
    emit('file', e.dataTransfer.files[0])
  }
}

/** 图片加载完成：按视口尺寸算适配比例并居中 */
function onImageLoad() {
  resetView()
}

function resetView() {
  const img = imgEl.value
  const viewport = viewportEl.value
  if (!img || !viewport) return
  const vw = viewport.clientWidth
  const vh = viewport.clientHeight
  const nw = img.naturalWidth || 1
  const nh = img.naturalHeight || 1
  if (!vw || !vh) return
  const fit = Math.min(vw / nw, vh / nh)
  fitScale.value = fit || 1
  scale.value = fitScale.value
  panX.value = (vw - nw * scale.value) / 2
  panY.value = (vh - nh * scale.value) / 2
}

function clampScale(next: number) {
  const min = fitScale.value * 0.5
  const max = Math.max(fitScale.value * 8, ZOOM_MAX)
  return Math.min(Math.max(next, Math.min(min, ZOOM_MIN)), max)
}

/** 以视口内某点为锚点缩放（默认中心） */
function zoomAt(nextScale: number, anchorX?: number, anchorY?: number) {
  const viewport = viewportEl.value
  if (!viewport) return
  const next = clampScale(nextScale)
  if (Math.abs(next - scale.value) < 0.0001) return
  const ax = anchorX ?? viewport.clientWidth / 2
  const ay = anchorY ?? viewport.clientHeight / 2
  const ratio = next / scale.value
  panX.value = ax - (ax - panX.value) * ratio
  panY.value = ay - (ay - panY.value) * ratio
  scale.value = next
}

function zoomBy(direction: 1 | -1) {
  zoomAt(scale.value * (direction > 0 ? 1.25 : 1 / 1.25))
}

function onWheel(e: WheelEvent) {
  const viewport = viewportEl.value
  if (!viewport) return
  const rect = viewport.getBoundingClientRect()
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  zoomAt(scale.value * factor, e.clientX - rect.left, e.clientY - rect.top)
}

let dragging = false
let dragStart = { x: 0, y: 0, panX: 0, panY: 0 }

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  // 按钮 / 控制条自己会 stop，这里只处理图片区域
  e.preventDefault()
  dragging = true
  dragStart = { x: e.clientX, y: e.clientY, panX: panX.value, panY: panY.value }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!dragging) return
  panX.value = dragStart.panX + (e.clientX - dragStart.x)
  panY.value = dragStart.panY + (e.clientY - dragStart.y)
}

function onMouseUp() {
  dragging = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
})
</script>
