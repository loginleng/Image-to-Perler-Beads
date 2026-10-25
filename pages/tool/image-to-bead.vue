<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 overflow-x-clip">
    <!-- Page Header -->
    <div class="mb-8">
      <h1 class="modern-section-title">{{ $t('tool.title') }}</h1>
      <p class="modern-section-subtitle">{{ $t('tool.upload') }}</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- ==================== Left: Settings Panel ==================== -->
      <!-- 大屏上左栏固定高度、自己滚动（sticky + max-h）：高级参数摊开后画布仍在视野里。
           不用纯 sticky：内容比视口高时 sticky 会把下半截顶出屏幕，滚不到。 -->
      <div class="min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1">
        <!-- Upload Area -->
        <div class="modern-card p-4">
          <UploadDropzone
            :preview-url="previewUrl"
            :cropped-preview-url="croppedPreviewUrl"
            @file="loadImage"
            @clear="clearCanvas"
            @crop="reopenCrop"
          />
        </div>

        <!-- Settings Panel: 基础 / 色板 / 图纸风格 / 高级参数 -->
        <SettingsPanel
          :grid-sizes="gridSizes"
          :selected-grid-size="selectedGridSize"
          :bead-size-options="beadSizeOptions"
          :bead-size="beadSize"
          :physical-size-cm="physicalSizeCm"
          :brand-palettes="brandPalettes"
          :selected-palette-id="selectedPaletteId"
          :current-variants="currentVariants"
          :selected-variant-id="selectedVariantId"
          :current-brand-palette="currentBrandPalette"
          :style-options="styleOptions"
          :selected-style="selectedStyle"
          :pattern-style-options="patternStyleOptions"
          :selected-pattern-style="patternStyle"
          :pattern-params="patternParams"
          @update:selected-grid-size="selectedGridSize = $event"
          @update:bead-size="beadSize = $event"
          @update:selected-palette-id="selectedPaletteId = $event"
          @update:selected-variant-id="selectedVariantId = $event"
          @update:selected-style="selectedStyle = $event"
          @update:selected-pattern-style="patternStyle = $event"
          @update:pattern-params="onParamsChange"
        />
      </div>

      <!-- ==================== Right: Preview Area ==================== -->
      <div class="min-w-0 lg:col-span-2 space-y-6">
        <!-- Preview Card -->
        <div class="modern-card p-6">
          <!-- 预览标题栏：左侧标题，右侧「清空 / 缩放」（参数改动自动重生成，不再有生成按钮） -->
          <div class="flex items-center justify-between mb-3 gap-3">
            <h2 class="text-lg font-bold text-gray-900 shrink-0">{{ $t('tool.preview') }}</h2>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <!-- 清空画布：同时清掉上传的图片与预览图 -->
              <button
                v-if="result"
                type="button"
                @click="clearCanvas"
                class="modern-btn modern-btn-secondary modern-btn-sm"
              >
                {{ $t('tool.clearCanvas') }}
              </button>
              <div v-if="hasImage" class="flex items-center gap-2 pl-2 ml-1 border-l border-gray-200">
                <label class="text-xs text-gray-500 shrink-0">{{ $t('tool.zoom') }}:</label>
                <input
                  v-model.number="zoomLevel"
                  type="range"
                  min="25"
                  max="300"
                  step="1"
                  class="w-24 accent-indigo-500 h-1.5 rounded-full appearance-none bg-gray-200 cursor-pointer"
                />
                <span class="text-xs font-mono text-gray-600 w-10 text-right">{{ zoomPercent }}%</span>
              </div>
            </div>
          </div>

          <!-- 功能工具栏（视图 / 工具 / 笔刷 / 撤销） -->
          <Toolbar
            v-if="hasImage"
            :show-grid="showGuideGrid"
            :show-coords="showGuideCoords"
            :label-step="labelStep"
            :label-steps="labelSteps"
            :brush-enabled="brushEnabled"
            :eraser-enabled="eraserEnabled"
            :replace-enabled="replaceEnabled"
            :brush-color-hex="brushColorHex"
            :brush-color-name="brushColorName"
            :brush-size="brushSize"
            :can-undo="undoStack.length > 0"
            @update:show-grid="showGuideGrid = $event"
            @update:show-coords="showGuideCoords = $event"
            @update:label-step="labelStep = $event"
            @update:brush-size="brushSize = $event"
            @toggle-brush="toggleBrush"
            @toggle-eraser="toggleEraser"
            @toggle-replace="toggleReplace"
            @open-color="openBrushColorPicker"
            @undo="undoPaint"
          />

          <!-- Error message -->
          <div v-if="errorMsg" class="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            {{ errorMsg }}
          </div>

          <BeadCanvas
            ref="beadCanvasRef"
            :pattern="result?.pattern ?? null"
            :colors="currentBrandColors"
            :bead-style="selectedStyle"
            :cell-size="effectiveCellSize"
            :zoom="zoomLevel"
            :tool="canvasTool"
            :brush-color="brushColor"
            :brush-size="brushSize"
            :show-grid="showGuideGrid"
            :show-coords="showGuideCoords"
            :label-step="labelStep"
            :render-token="renderToken"
            :processing="processing"
            :has-image="hasImage"
            @update:zoom="zoomLevel = $event"
            @stroke-start="pushUndo"
            @paint="onPaint"
            @select-color="onCanvasSelectColor"
          />

          <!-- 导出（空白画布没有可导出内容） -->
          <ExportBar
            v-if="result && hasCanvasContent"
            :pattern="result.pattern"
            :colors="currentBrandColors"
            :bead-style="selectedStyle"
            :stats="result.stats"
            :show-grid="showGuideGrid"
            :show-coords="showGuideCoords"
            :label-step="labelStep"
          />
        </div>

        <!-- Color Statistics：空白画布（没有可拼珠的格子）时不显示 -->
        <div v-if="result && hasCanvasContent && !processing" class="modern-card p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-gray-900">{{ $t('tool.colorStats') }}</h3>
            <div class="flex items-center gap-4 text-sm text-gray-600">
              <button
                v-if="patternSnapshot"
                type="button"
                class="text-xs text-gray-600 hover:text-gray-900 underline"
                @click="resetColor"
              >{{ $t('tool.reset') }}</button>
              <span class="flex items-center gap-1.5">
                <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                {{ $t('tool.totalBeads') }}: <strong>{{ result.totalBeads }}</strong>
              </span>
              <span class="flex items-center gap-1.5">
                <svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg>
                {{ $t('tool.estimatedWeight') }}: <strong>~{{ estimatedWeight }}g</strong>
              </span>
            </div>
          </div>

          <!-- Color Stats Table（固定高度约 6 行，超出滚动；仅作统计展示，不参与选色） -->
          <PatternStatsCard
            v-if="result?.stats"
            :stats="result.stats"
            :total-beads="result.totalBeads"
            :selected-color-code="selectedColorCode"
            @replace="onStatsReplace"
          />
        </div>
      </div>
    </div>

    <!-- 选色弹窗：画笔 / 替色 / 颜色统计整体替换共用，浮层展示不占页面布局 -->
    <ColorDialog
      :open="showColorPicker"
      :mode="colorPickerMode"
      :colors="currentBrandColors"
      :source-code="selectedColorCode"
      :brush-code="brushColor"
      @pick="onColorPicked"
      @confirm-global="confirmGlobalReplace"
      @close="closeColorPicker"
    />

    <!-- 裁剪弹窗：确认即重生成 -->
    <CropDialog
      :open="showCropModal"
      :source="sourceCanvas"
      :image-url="previewUrl"
      @confirm="onCropConfirm"
      @cancel="cancelCrop"
    />
  </div>
</template>

<script setup lang="ts">
import { ALL_BRAND_PALETTES } from '~/utils/palettes-data'
import type { BeadStyle } from '~/utils/bead-algorithm'
import { paramsFromStyle, toConvertOptions, type PatternParams } from '~/utils/pattern-params'
import type { BeadColor } from '~/types'

const { t } = useI18n()

// ==================== State ====================
const beadCanvasRef = ref<{ invalidate: () => void; resetView: () => void } | null>(null)
const previewUrl = ref<string>('')
const imageData = ref<ImageData | null>(null)
const result = ref<{ pattern: string[][]; stats: any[]; totalBeads: number } | null>(null)
const processing = ref(false)
const errorMsg = ref<string>('')
/** 画布重绘信号：图案/色板等变了就自增，BeadCanvas 据此让渲染缓存失效 */
const renderToken = ref(0)

// 图纸大小：只选宽度，高度按图片宽高比自适应
const gridSizes = [
  { label: '52', value: '52' },
  { label: '78', value: '78' },
  { label: '104', value: '104' },
]
const selectedGridSize = ref('52')

// 网格大小（珠子规格）：5MM 标准珠 / 2.6MM 迷你珠
const beadSizeOptions = ['5MM', '2.6MM'] as const
const beadSize = ref<'5MM' | '2.6MM'>('5MM')

// Bead style（label 走 i18n：tool.square / tool.round / tool.hollow）
const styleOptions = [
  { key: 'grid-square' as BeadStyle, labelKey: 'tool.square', icon: '▣' },
  { key: 'grid-round' as BeadStyle, labelKey: 'tool.round', icon: '●' },
  { key: 'grid-hollow-round' as BeadStyle, labelKey: 'tool.hollow', icon: '○' },
]
const selectedStyle = ref<BeadStyle>('grid-square')

// 图纸风格：决定「怎么降采样」与「降噪多强」。参数口径集中在 utils/bead-algorithm.ts 的
// PATTERN_STYLES，这里只负责选哪一档，别把数值散在页面里。
//   flat   = 扁平简洁：边缘感知加权量化 + 降噪 2 + 空间/色号合并（边界干净、色号最少，默认）
//   detail = 细节优先：加权量化 + 降噪 1（保留小色块与描边）
//   smooth = 平滑自然：面积平均降采样 + 不降噪（过渡柔和，不清杂点）
//   photo  = 照片写实：平滑采样 + 误差扩散抖动（渐变最贴原图，色号数最高，不清杂点）
const patternStyleOptions = [
  { key: 'flat', labelKey: 'tool.patternStyleFlat', icon: '▦' },
  { key: 'detail', labelKey: 'tool.patternStyleDetail', icon: '◆' },
  { key: 'smooth', labelKey: 'tool.patternStyleSmooth', icon: '○' },
  { key: 'photo', labelKey: 'tool.patternStylePhoto', icon: '◈' },
]
const patternStyle = ref('flat')

// 图纸参数：预设只负责给默认值，用户可以在「高级参数」里逐项改。
// 切风格会把整组参数重置成那一档的值（否则会出现「风格是 photo、参数还是 flat」的错位）。
const patternParams = ref<PatternParams>(paramsFromStyle(patternStyle.value))

/** 高级参数改动：换成新对象（patternParams 的 watch 负责防抖重生成） */
function onParamsChange(next: PatternParams) {
  patternParams.value = next
}

// Zoom
const zoomLevel = ref(100)

// 预览辅助开关
const showGuideGrid = ref(true)
const showGuideCoords = ref(true)
// 坐标标注步长：每 N 格标一个数字（网格粗线固定每 10 格，不受此影响）
const labelSteps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const labelStep = ref(10)

// Color selection for replacement
const selectedColorCode = ref<string | null>(null)
// 颜色替换前的图案快照（用于“重置”恢复原色）
const patternSnapshot = ref<string[][] | null>(null)

// Brand palettes
const brandPalettes = ref(ALL_BRAND_PALETTES)
const selectedPaletteId = ref(ALL_BRAND_PALETTES[0].id)

// Color variant
const selectedVariantId = ref<string>('')

// ==================== Brush (画笔) ====================
const brushEnabled = ref(false)
const eraserEnabled = ref(false)
// 单格替色：点 / 划过哪一格就把该格换成当前颜色（不受笔刷大小影响）
const replaceEnabled = ref(false)
const brushColor = ref<string>('')
// 选色弹窗：画笔 / 替色 / 颜色统计整体替换共用，作为浮层不侵占页面布局
type ColorPickerMode = 'brush' | 'replace' | 'global'
const showColorPicker = ref(false)
const colorPickerMode = ref<ColorPickerMode>('brush')
// 笔刷大小（直径，格数）：1、3、5、7
const brushSize = ref(1)
// 涂画重绘的 rAF 句柄（一帧只重绘一次）
let paintRaf = 0
// 撤销栈：每笔（一次按下到抬起）开始前压入一份图案快照
const undoStack = ref<string[][][]>([])

// ==================== Computed ====================
const effectiveCellSize = computed(() => {
  const size = parseInt(selectedGridSize.value)
  // Base size fits the 600px container at 100% zoom; zoom scales linearly.
  // No lower clamp, otherwise large grids stay stuck at the minimum cell size
  // and zooming appears broken.
  const baseCellSize = Math.floor(600 / size)
  return Math.max(1, Math.floor(baseCellSize * zoomLevel.value / 100))
})

const zoomPercent = computed(() => Math.round(zoomLevel.value))
// 有图（或已生成过图案）即视为有内容，控制工具栏/空状态显隐
const hasImage = computed(() => !!imageData.value || !!result.value)

// 画布是否已有可拼珠的格子（全透明 = 空白画布，不算内容）
const hasCanvasContent = computed(() => {
  const pattern = result.value?.pattern
  if (!pattern?.length) return false
  for (const row of pattern) {
    for (const code of row) {
      if (code && code !== 'TRANSPARENT') return true
    }
  }
  return false
})

/** 交给画布的工具态：三个开关互斥，统一折算成一个值 */
const canvasTool = computed<'none' | 'brush' | 'eraser' | 'replace'>(() => {
  if (brushEnabled.value) return 'brush'
  if (eraserEnabled.value) return 'eraser'
  if (replaceEnabled.value) return 'replace'
  return 'none'
})

const currentBrandPalette = computed(() => {
  return brandPalettes.value.find(p => p.id === selectedPaletteId.value) || brandPalettes.value[0]
})

const currentVariants = computed(() => currentBrandPalette.value.variants || [])

// Initialize/reset selectedVariantId when palette changes
watch(selectedPaletteId, () => {
  const variants = currentVariants.value
  selectedVariantId.value = variants.length > 0 ? variants[0].id : ''
}, { immediate: true })

const currentBrandColors = computed<BeadColor[]>(() => {
  const palette = currentBrandPalette.value
  if (!selectedVariantId.value) return palette.colors
  const variant = currentVariants.value.find(v => v.id === selectedVariantId.value)
  if (!variant) return palette.colors
  // 显式色号列表优先：按套装色号过滤（保持套装定义顺序）
  if (variant.codes && variant.codes.length > 0) {
    const colorByCode = new Map(palette.colors.map(c => [c.code, c]))
    const filtered = variant.codes
      .map(code => colorByCode.get(code))
      .filter((c): c is BeadColor => Boolean(c))
    if (filtered.length > 0) return filtered
  }
  return palette.colors.slice(0, variant.colorCount)
})

const brushColorHex = computed(() => {
  const color = currentBrandColors.value.find(c => c.code === brushColor.value)
  return color ? color.hex : '#FFFFFF'
})

const brushColorName = computed(() => {
  const color = currentBrandColors.value.find(c => c.code === brushColor.value)
  return color ? color.name : brushColor.value
})

const estimatedWeight = computed(() => {
  if (!result.value) return 0
  // 5mm 标准珠约 0.3g/颗，2.6mm 迷你珠约 0.08g/颗
  const weightPerBead = beadSize.value === '2.6MM' ? 0.08 : 0.3
  return Math.round(result.value.totalBeads * weightPerBead * 10) / 10
})

// 成品物理尺寸（cm）：珠子直径 × 格数。切换 5MM/2.6MM 时随之变化
const physicalSizeCm = computed(() => {
  if (!result.value) return null
  const cols = result.value.pattern[0].length
  const rows = result.value.pattern.length
  const mmPerBead = beadSize.value === '2.6MM' ? 2.6 : 5
  return {
    w: (cols * mmPerBead) / 10,
    h: (rows * mmPerBead) / 10,
  }
})

// ==================== 重绘调度 ====================
/** 通知画布重绘：图案内容变了就自增，BeadCanvas 据此让渲染缓存失效 */
function bumpRender() {
  renderToken.value++
}

// ==================== Crop ====================
const showCropModal = ref(false)
// 这次裁剪是「从缩略图重新打开」的（而不是刚上传）：取消时只关弹窗，不能清空已有成果
let cropReopened = false
const sourceCanvas = ref<HTMLCanvasElement | null>(null)
const croppedPreviewUrl = ref('')

// ==================== Lifecycle ====================
onMounted(() => {
  // 给一张空白画布：用户不上传图片也能直接在画布上作画
  initBlankCanvas()
  // 等色板相关的 watch 落定，画笔颜色才能取到当前套装的有效色号
  nextTick(() => {
    ensureBrushColor()
    bumpRender()
  })
})

onBeforeUnmount(() => {
  if (paintRaf) cancelAnimationFrame(paintRaf)
  if (autoConvertTimer) clearTimeout(autoConvertTimer)
})

// ==================== 自动重生成 ====================
// 只要有原图，任何影响量化的改动（宽度 / 色板 / 风格 / 高级参数）都直接重出图纸，
// 不再经过「生成图纸」按钮；防抖把连续拖动滑块合并成一次转换。
const AUTO_CONVERT_DELAY = 500
let autoConvertTimer: ReturnType<typeof setTimeout> | null = null

function scheduleAutoConvert() {
  if (!imageData.value) return
  if (autoConvertTimer) clearTimeout(autoConvertTimer)
  autoConvertTimer = setTimeout(() => {
    autoConvertTimer = null
    convertImage()
  }, AUTO_CONVERT_DELAY)
}

// 修改图纸大小：有原图时自动重生成；没有原图时，空白画布直接按新宽度重建
watch(selectedGridSize, () => {
  if (imageData.value) {
    scheduleAutoConvert()
    return
  }
  // 已有手绘内容时保持不动，避免改宽度把画的东西清掉
  if (!hasCanvasContent.value) resetToBlankCanvas()
})

// 切换色板/套餐：当前选中色不在新套餐内时重置；有原图时自动按新色板重出图纸
watch([selectedPaletteId, selectedVariantId], () => {
  if (selectedColorCode.value && !currentBrandColors.value.some(c => c.code === selectedColorCode.value)) {
    selectedColorCode.value = null
    patternSnapshot.value = null
  }
  ensureBrushColor()
  bumpRender()
  scheduleAutoConvert()
}, { deep: true })

// 切换图纸风格：整组参数换成该预设的值；patternParams 的 watch 会触发自动重生成
watch(patternStyle, (key) => {
  patternParams.value = paramsFromStyle(key)
})

// 高级参数（含风格切换带入的新参数）：有原图就防抖重出图纸
watch(patternParams, () => {
  scheduleAutoConvert()
}, { deep: true })

// 珠子样式变化：画布要换绘制方式，但不重新量化
watch(selectedStyle, () => {
  if (result.value) bumpRender()
})

// ==================== Image handling ====================
/** 按当前图纸宽度生成一张全透明画布（PC 端无原图时按正方形处理） */
function blankPatternForGrid(): string[][] {
  const size = Math.max(1, Math.min(300, parseInt(selectedGridSize.value) || 52))
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 'TRANSPARENT'))
}

/**
 * 重置为空白画布：不需要上传图片也能直接画。
 * 计数 / 撤销 / 选中色 / 工具状态一并复位，随后重绘。
 */
function resetToBlankCanvas() {
  result.value = { pattern: blankPatternForGrid(), stats: [], totalBeads: 0 }
  selectedColorCode.value = null
  patternSnapshot.value = null
  undoStack.value = []
  brushEnabled.value = false
  eraserEnabled.value = false
  replaceEnabled.value = false
  showColorPicker.value = false
  ensureBrushColor()
  nextTick(() => bumpRender())
}

/** 页面初始化：先给一张可绘制的空白画布 */
function initBlankCanvas() {
  if (result.value) return
  resetToBlankCanvas()
}

/**
 * 清空画布 + 上传的图片 + 预览图，回到一张新的空白画布。
 * 有内容时二次确认（预览图的 × 与「清空画布」按钮共用）。
 */
function clearCanvas() {
  const hasAnything = !!imageData.value || !!previewUrl.value || hasCanvasContent.value
  if (hasAnything && !window.confirm(t('tool.clearCanvasConfirm'))) return

  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  if (croppedPreviewUrl.value) URL.revokeObjectURL(croppedPreviewUrl.value)
  previewUrl.value = ''
  croppedPreviewUrl.value = ''
  imageData.value = null
  sourceCanvas.value = null
  errorMsg.value = ''
  showCropModal.value = false
  showColorPicker.value = false
  // 清空后的空白画布固定回到 100% 缩放与左上角，避免沿用旧缩放/滚动位置产生“缩放后的效果”
  zoomLevel.value = 100
  resetToBlankCanvas()
  nextTick(() => {
    bumpRender()
    beadCanvasRef.value?.resetView()
  })
}

function loadImage(file: File) {
  if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
    errorMsg.value = t('tool.invalidFormat')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    errorMsg.value = t('tool.fileTooLarge')
    return
  }

  errorMsg.value = ''
  cropReopened = false
  // Revoke the previous object URL to avoid leaking memory on repeated uploads
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
  previewUrl.value = URL.createObjectURL(file)

  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    sourceCanvas.value = canvas
    // 打开裁剪弹窗，确认裁剪后再进行转换
    showCropModal.value = true
  }
  img.onerror = () => {
    errorMsg.value = t('tool.loadFailed')
  }
  img.src = previewUrl.value
}

// ==================== Crop handlers ====================
/** 裁剪确认：收下 ImageData 与预览 URL，并立即按图片重出图纸 */
function onCropConfirm(payload: { imageData: ImageData; url: string }) {
  imageData.value = payload.imageData
  if (croppedPreviewUrl.value) URL.revokeObjectURL(croppedPreviewUrl.value)
  croppedPreviewUrl.value = payload.url
  showCropModal.value = false
  cropReopened = false
  convertImage()
}

/**
 * 点击缩略图重新打开裁剪弹窗。
 * 若当前只有 imageData（例如其它入口只带来了像素数据），先据它补一张底图，
 * 否则裁剪弹窗既没底图、也取不到源，点了会没反应。
 */
function reopenCrop() {
  if (!sourceCanvas.value && imageData.value) {
    const c = document.createElement('canvas')
    c.width = imageData.value.width
    c.height = imageData.value.height
    c.getContext('2d')!.putImageData(imageData.value, 0, 0)
    sourceCanvas.value = c
  }
  if (!sourceCanvas.value) return
  cropReopened = true
  showCropModal.value = true
}

function cancelCrop() {
  showCropModal.value = false
  // 从缩略图重新打开的裁剪：取消只是「不改了」，已有成果必须原样保留
  if (cropReopened) {
    cropReopened = false
    return
  }
  // 放弃本次上传
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  if (croppedPreviewUrl.value) URL.revokeObjectURL(croppedPreviewUrl.value)
  previewUrl.value = ''
  croppedPreviewUrl.value = ''
  imageData.value = null
  sourceCanvas.value = null
  errorMsg.value = ''
}

// ==================== Core conversion ====================
async function convertImage() {
  if (!imageData.value || !currentBrandPalette.value) return

  if (!currentBrandColors.value || currentBrandColors.value.length === 0) {
    errorMsg.value = t('tool.paletteEmpty')
    return
  }

  processing.value = true
  errorMsg.value = ''

  try {
    const size = parseInt(selectedGridSize.value)
    const { convertImageToBeadPattern } = await import('~/utils/bead-algorithm')

    // 高度自适应：按原图宽高比换算，保持图案比例不变形
    const targetHeight = Math.max(1, Math.round(size * imageData.value.height / imageData.value.width))
    const conversionResult = convertImageToBeadPattern({
      imageData: imageData.value,
      targetWidth: size,
      targetHeight,
      palette: currentBrandColors.value,
      // 全部图纸参数来自左栏（预设给了默认值，用户可逐项改），这里不再直接读 PATTERN_STYLES
      ...toConvertOptions(patternParams.value),
    })

    result.value = conversionResult
    patternSnapshot.value = null
    selectedColorCode.value = null
    undoStack.value = []
    ensureBrushColor()
    bumpRender()
    await nextTick()
  } catch (e) {
    console.error('Conversion failed:', e)
    errorMsg.value = t('tool.conversionFailed', { message: e instanceof Error ? e.message : 'Unknown error' })
  } finally {
    processing.value = false
  }
}

// ==================== Painting ====================

/** 画布回传落笔结果：改 pattern → 重算统计 → 重绘（一帧合并一次） */
function onPaint(payload: { cells: { x: number; y: number }[]; code: string }) {
  const pattern = result.value?.pattern
  if (!pattern) return
  let changed = false
  for (const c of payload.cells) {
    if (pattern[c.y][c.x] !== payload.code) {
      pattern[c.y][c.x] = payload.code
      changed = true
    }
  }
  if (!changed || paintRaf) return
  paintRaf = requestAnimationFrame(() => {
    paintRaf = 0
    recalculateStats()
    bumpRender()
  })
}

/** 一笔开始前压入当前图案快照，用于撤销（最多保留 50 步） */
function pushUndo() {
  if (!result.value) return
  undoStack.value.push(result.value.pattern.map(row => [...row]))
  if (undoStack.value.length > 50) undoStack.value.shift()
}

function undoPaint() {
  const snapshot = undoStack.value.pop()
  if (!snapshot || !result.value) return
  result.value.pattern = snapshot
  recalculateStats()
  bumpRender()
}

function recalculateStats() {
  if (!result.value || !currentBrandPalette.value) return

  const pattern = result.value.pattern
  const colorCount = new Map<string, number>()

  for (const row of pattern) {
    for (const code of row) {
      // 透明格不拼珠，不计入颜色统计
      if (!code || code === 'TRANSPARENT') continue
      colorCount.set(code, (colorCount.get(code) || 0) + 1)
    }
  }

  result.value.stats = Array.from(colorCount.entries())
    .map(([colorCode, count]) => {
      const color = currentBrandColors.value.find(c => c.code === colorCode)
      return {
        colorCode,
        count,
        hex: color?.hex || '#FFFFFF',
        name: color?.name || 'Unknown',
      }
    })
    .sort((a, b) => b.count - a.count)

  result.value.totalBeads = result.value.stats.reduce((sum, s) => sum + s.count, 0)
}

// ==================== Brush 画笔 ====================
// 确保画笔颜色是当前调色板中的有效色号（默认取第一个颜色）
function ensureBrushColor() {
  const colors = currentBrandColors.value
  if (colors.length === 0) {
    brushColor.value = ''
    return
  }
  if (!brushColor.value || !colors.some(c => c.code === brushColor.value)) {
    brushColor.value = colors[0].code
  }
}

function toggleBrush() {
  brushEnabled.value = !brushEnabled.value
  if (brushEnabled.value) {
    // 画笔 / 橡皮 / 替色三者互斥
    eraserEnabled.value = false
    replaceEnabled.value = false
    ensureBrushColor()
    selectedColorCode.value = null
    patternSnapshot.value = null
  }
}

function toggleEraser() {
  eraserEnabled.value = !eraserEnabled.value
  if (eraserEnabled.value) {
    // 橡皮擦与画笔 / 替色互斥
    brushEnabled.value = false
    replaceEnabled.value = false
    selectedColorCode.value = null
    patternSnapshot.value = null
  }
}

function toggleReplace() {
  replaceEnabled.value = !replaceEnabled.value
  if (replaceEnabled.value) {
    // 单格替色：与画笔 / 橡皮互斥，颜色沿用当前画笔色
    brushEnabled.value = false
    eraserEnabled.value = false
    ensureBrushColor()
    selectedColorCode.value = null
    patternSnapshot.value = null
  }
}

// ==================== Color Selection & Replacement ====================
/** 打开画笔 / 替色的选色弹窗 */
function openBrushColorPicker() {
  ensureBrushColor()
  colorPickerMode.value = replaceEnabled.value ? 'replace' : 'brush'
  showColorPicker.value = true
}

/** 画布上点格子：只作为「整体替换」的快捷入口 */
function onCanvasSelectColor(code: string) {
  selectedColorCode.value = code
  colorPickerMode.value = 'global'
  showColorPicker.value = true
}

/** 弹窗内选色：画笔/替色选中即生效并关闭 */
function onColorPicked(code: string) {
  brushColor.value = code
  showColorPicker.value = false
}

function closeColorPicker() {
  showColorPicker.value = false
  selectedColorCode.value = null
}

/** 颜色统计行「整体替换」：打开选色弹窗，选目标色后确定 */
function onStatsReplace(stat: { colorCode: string }) {
  if (!stat?.colorCode) return
  selectedColorCode.value = stat.colorCode
  patternSnapshot.value = null
  colorPickerMode.value = 'global'
  showColorPicker.value = true
}

function confirmGlobalReplace(to: string) {
  const from = selectedColorCode.value
  if (!from || !to || from === to) return
  replaceColor(from, to)
  closeColorPicker()
}

function replaceColor(oldCode: string, newCode: string) {
  if (!result.value || oldCode === newCode) return

  // 首次替换前保存原始图案，供“重置”一键恢复
  if (!patternSnapshot.value) {
    patternSnapshot.value = result.value.pattern.map(row => [...row])
  }

  const pattern = result.value.pattern
  for (let y = 0; y < pattern.length; y++) {
    for (let x = 0; x < pattern[y].length; x++) {
      if (pattern[y][x] === oldCode) {
        pattern[y][x] = newCode
      }
    }
  }

  recalculateStats()
  bumpRender()
  // 选中色更新为新色，选色板保持展开，可继续替换或重置
  selectedColorCode.value = newCode
}

// 重置：恢复替换前的原始图案
function resetColor() {
  if (!result.value || !patternSnapshot.value) return
  result.value.pattern = patternSnapshot.value
  patternSnapshot.value = null
  selectedColorCode.value = null
  recalculateStats()
  bumpRender()
}

// 任一弹窗打开时锁定整页滚动，避免移动端弹窗内部滚动穿透到浏览器整页
useScrollLock([showCropModal, showColorPicker])
</script>
