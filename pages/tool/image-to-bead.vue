<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 overflow-x-clip">
    <!-- Page Header -->
    <div class="mb-8">
      <h1 class="modern-section-title">{{ $t('tool.title') }}</h1>
      <p class="modern-section-subtitle">{{ $t('tool.upload') }}</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- ==================== Left: Settings Panel ==================== -->
      <div class="min-w-0 space-y-6">
        <!-- Upload Area -->
        <div class="modern-card p-6">
          <UploadDropzone
            :preview-url="previewUrl"
            :cropped-preview-url="croppedPreviewUrl"
            @file="loadImage"
            @clear="clearCanvas"
            @crop="reopenCrop"
          />
        </div>

        <!-- Settings Panel: grid size / bead size / palette / style -->
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
          @update:selected-grid-size="selectedGridSize = $event"
          @update:bead-size="beadSize = $event"
          @update:selected-palette-id="selectedPaletteId = $event"
          @update:selected-variant-id="selectedVariantId = $event"
          @update:selected-style="selectedStyle = $event"
          @update:selected-pattern-style="patternStyle = $event"
        />
      </div>

      <!-- ==================== Right: Preview Area ==================== -->
      <div class="min-w-0 lg:col-span-2 space-y-6">
        <!-- Preview Card -->
        <div class="modern-card p-6">
          <!-- 预览标题栏：左侧标题，右侧「生成 / 清空 / 缩放」 -->
          <div class="flex items-center justify-between mb-3 gap-3">
            <h2 class="text-lg font-bold text-gray-900 shrink-0">{{ $t('tool.preview') }}</h2>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <!-- 上传图片后不再自动生成：由用户确认参数后手动生成 -->
              <button
                v-if="imageData"
                type="button"
                @click="onGenerate"
                :disabled="processing"
                class="modern-btn modern-btn-primary modern-btn-sm"
                :class="{ 'opacity-60 cursor-wait': processing }"
              >
                {{ paramsDirty || hasCanvasContent ? $t('tool.regenerate') : $t('tool.generate') }}
              </button>
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

          <!-- 功能工具栏（分组布局：视图 | 工具 | 笔刷设置 | 编辑） -->
          <div v-if="hasImage" class="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-100">
            <!-- 视图组 -->
            <div class="flex items-center gap-2 pr-2 mr-1 border-r border-gray-200">
              <button
                type="button"
                @click="showGuideGrid = !showGuideGrid"
                class="px-2.5 py-1 rounded-md text-xs font-medium border transition-all"
                :class="showGuideGrid ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'"
              >{{ $t('tool.grid') }}</button>
              <button
                type="button"
                @click="showGuideCoords = !showGuideCoords"
                class="px-2.5 py-1 rounded-md text-xs font-medium border transition-all"
                :class="showGuideCoords ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'"
              >{{ $t('tool.coords') }}</button>
              <label class="flex items-center gap-1.5 text-xs text-gray-500" :title="$t('tool.coordStepTitle')">
                {{ $t('tool.coordStep', { n: labelStep }) }}
                <select
                  v-model.number="labelStep"
                  class="px-1.5 py-1 rounded-md text-xs font-medium border bg-gray-50 text-gray-600 border-gray-200 outline-none"
                >
                  <option v-for="n in labelSteps" :key="n" :value="n">{{ n }}</option>
                </select>
              </label>
            </div>

            <!-- 工具组 -->
            <div class="flex items-center gap-2 pr-2 mr-1 border-r border-gray-200">
              <button
                type="button"
                @click="toggleBrush"
                class="px-2.5 py-1 rounded-md text-xs font-medium border transition-all flex items-center gap-1.5"
                :class="brushEnabled ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.812a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" /></svg>
                {{ $t('tool.brush') }}
              </button>
              <button
                type="button"
                @click="toggleEraser"
                class="px-2.5 py-1 rounded-md text-xs font-medium border transition-all flex items-center gap-1.5"
                :class="eraserEnabled ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 20h12M4.5 15.5L15.086 4.914a2 2 0 012.828 0l1.172 1.172a2 2 0 010 2.828L8.5 19.5a2 2 0 01-1.414.586L4.5 20v-4.5z" /></svg>
                {{ $t('tool.eraser') }}
              </button>
              <button
                type="button"
                @click="toggleReplace"
                class="px-2.5 py-1 rounded-md text-xs font-medium border transition-all flex items-center gap-1.5"
                :class="replaceEnabled ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
                {{ $t('tool.replace') }}
              </button>
            </div>

            <!-- 笔刷设置组（画笔/替色模式下显示；替色是单格替换，不显示笔刷大小） -->
            <div v-if="brushEnabled || replaceEnabled" class="flex items-center gap-2 pr-2 mr-1 border-r border-gray-200">
              <button
                type="button"
                @click="openBrushColorPicker"
                class="px-2.5 py-1 rounded-md text-xs font-medium border transition-all flex items-center gap-1.5 bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
              >
                <span class="w-4 h-4 rounded-sm border border-black/20 shrink-0" :style="{ backgroundColor: brushColorHex }"></span>
                {{ brushColorName }}
              </button>
              <template v-if="brushEnabled">
                <label class="text-xs text-gray-500 shrink-0">{{ $t('tool.brushSize') }}:</label>
                <select v-model.number="brushSize" class="modern-select" style="padding: 4px 8px; font-size: 12px; width: 72px;">
                  <option :value="1">1×1</option>
                  <option :value="3">3×3</option>
                  <option :value="5">5×5</option>
                  <option :value="7">7×7</option>
                </select>
              </template>
              <span v-else class="text-[11px] text-gray-400">单格替换</span>
            </div>

            <!-- 编辑组：撤销常驻（只要画布有内容/历史就可见，不随工具切换消失） -->
            <div v-if="hasCanvasContent || undoStack.length > 0" class="flex items-center gap-2">
              <button
                type="button"
                @click="undoPaint"
                :disabled="undoStack.length === 0"
                class="px-2.5 py-1 rounded-md text-xs font-medium border transition-all flex items-center gap-1.5"
                :class="undoStack.length > 0 ? 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100' : 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed'"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                {{ $t('tool.undo') }}
              </button>
            </div>
          </div>

          <!-- Error message -->
          <div v-if="errorMsg" class="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            {{ errorMsg }}
          </div>

          <!-- 本地草稿恢复提示（刷新 / 重新打开页面后创作内容不遗失） -->
          <div v-if="draftRestored" class="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700 flex items-center gap-2">
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span class="flex-1">{{ $t('tool.draftRestored') }}</span>
            <button @click="discardDraft" class="text-xs underline shrink-0">{{ $t('tool.discard') }}</button>
          </div>

          <!-- Canvas Container。
               注意：这里用固定 padding 提供四周留白，而不是 flex+margin:auto 居中——
               交互式画布的"以鼠标为锚点缩放"依赖 scrollLeft 精确锚定，
               其公式假设滚动内容固定在容器起点（margin=0）；
               若改用 margin:auto 居中，画布位置会随尺寸动态变化，导致锚点失效（缩放跳回左上角）。 -->
          <div
            ref="canvasContainer"
            class="relative bg-gray-50 rounded-xl border border-gray-200 overflow-auto select-none cursor-grab active:cursor-grabbing"
            style="width: 100%; height: 600px; padding: 24px;"
            @wheel.prevent="handleWheelZoom"
            @mousedown="onCanvasContainerMouseDown"
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
            <!-- Canvas（包裹层承担缩放后的布局尺寸，canvas 直接以自身像素尺寸显示，无 CSS transform 缩放，避免亚像素抖动） -->
            <div ref="previewWrap" :style="previewWrapStyle" class="relative">
              <canvas
                ref="previewCanvas"
                :class="[{ 'opacity-30': processing }, brushEnabled || eraserEnabled || replaceEnabled ? 'cursor-cell' : 'cursor-crosshair']"
                :style="previewCanvasStyle"
                @click="handleCanvasClick"
                @mousedown="onCanvasMouseDown"
                @mousemove="onCanvasMouseMove"
                @mouseleave="onCanvasMouseLeave"
              />
            </div>
          </div>

          <!-- 色号悬停提示：Teleport 到 body + fixed 定位，避免被容器 overflow/z-index 遮挡 -->
          <Teleport to="body">
            <div
              v-if="previewHoverTip"
              class="fixed z-[9999] pointer-events-none px-2 py-1 rounded-md bg-gray-900/90 text-white text-xs shadow-lg whitespace-nowrap"
              :style="{ left: previewHoverTip.x + 'px', top: previewHoverTip.y + 'px', transform: 'translate(12px, 12px)' }"
            >{{ previewHoverTip.text }}</div>
          </Teleport>

          <!-- Export / Save / Order Buttons：空白画布没有可导出内容 -->
          <div v-if="result && hasCanvasContent" class="flex flex-wrap gap-3 mt-4">
            <button @click="exportPng" class="modern-btn modern-btn-primary modern-btn-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              {{ $t('tool.exportPng') }}
            </button>
            <button @click="exportPdf" class="modern-btn modern-btn-secondary modern-btn-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
              {{ $t('tool.exportPdf') }}
            </button>
          </div>
        </div>

        <!-- Color Statistics -->
        <div v-if="result && !processing" class="modern-card p-6">
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
    <div
      v-if="showColorPicker"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @mousedown.self="closeColorPicker"
    >
      <div class="modern-card flex max-h-[80vh] w-full max-w-lg flex-col p-4">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h3 class="truncate text-base font-bold text-gray-900">{{ colorPickerTitle }}</h3>
          <button
            type="button"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            @click="closeColorPicker"
          >×</button>
        </div>

        <!-- 整体替换：展示源色 → 目标色；选目标色后点确定 -->
        <div v-if="colorPickerMode === 'global'" class="mb-2 flex items-center gap-2 text-xs text-gray-600">
          <span class="h-4 w-4 rounded border border-gray-200" :style="{ backgroundColor: selectedColorHex }"></span>
          <span class="font-mono">{{ selectedColorCode }}</span>
          <span>→</span>
          <span class="h-4 w-4 rounded border border-gray-200" :style="{ backgroundColor: globalReplaceTarget ? currentBrandColors.find(c => c.code === globalReplaceTarget)?.hex || 'transparent' : 'transparent' }"></span>
          <span class="font-mono">{{ globalReplaceTarget || $t('tool.selectColor') }}</span>
        </div>

        <div class="min-h-0 flex-1">
          <ColorPicker
            :colors="currentBrandColors"
            :selected="colorPickerMode === 'global' ? globalReplaceTarget : brushColor"
            max-height="52vh"
            @select="onColorPicked"
          />
        </div>

        <div v-if="colorPickerMode === 'global'" class="mt-3 flex justify-end gap-2">
          <button type="button" class="modern-btn modern-btn-secondary modern-btn-sm" @click="closeColorPicker">
            {{ $t('tool.close') }}
          </button>
          <button
            type="button"
            class="modern-btn modern-btn-primary modern-btn-sm"
            :disabled="!globalReplaceTarget || globalReplaceTarget === selectedColorCode"
            :class="{ 'opacity-50 cursor-not-allowed': !globalReplaceTarget || globalReplaceTarget === selectedColorCode }"
            @click="confirmGlobalReplace"
          >
            {{ $t('tool.globalReplace') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ==================== Crop Modal ==================== -->
    <div
      v-if="showCropModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @mousedown.self="cancelCrop"
    >
      <div class="modern-card p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-4">{{ $t('tool.crop') }}</h3>

        <!-- 裁剪交互：原图 + 可拖动/缩放选框 -->
        <div
          class="mb-4 rounded-lg border border-gray-200 overflow-auto flex justify-center"
          style="max-height: 600px; padding: 16px; background: repeating-conic-gradient(#f3f4f6 0% 25%, #e5e7eb 0% 50%) 0 0 / 16px 16px;"
        >
          <div class="relative shrink-0" :style="cropStageStyle">
            <img :src="previewUrl" :style="cropImageStyle" class="block select-none" draggable="false" alt="" />
            <!-- 裁剪选框：拖动移动，四角缩放；框外区域变暗 -->
            <div
              class="absolute cursor-move touch-none"
              :style="[cropBoxStyle, { boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }]"
              @pointerdown="startDragBox"
            >
              <span
                v-for="h in cropHandles"
                :key="h"
                class="absolute w-3.5 h-3.5 bg-white border border-gray-400 rounded-sm"
                :style="cropHandleStyle(h)"
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
              v-for="r in cropRatios"
              :key="r.key"
              type="button"
              @click="cropRatio = r.key"
              :class="[
                'px-3 py-2 rounded-lg text-sm font-medium transition-all text-center',
                cropRatio === r.key
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
              ]"
            >{{ r.labelKey ? $t(r.labelKey) : r.label }}</button>
          </div>
        </div>

        <!-- 图片大小（25% - 200%） -->
        <div class="mb-6">
          <label class="block text-sm font-semibold text-gray-900 mb-2">
            {{ $t('tool.cropScale') }}: <span class="font-mono">{{ cropScale }}%</span>
          </label>
          <input
            v-model.number="cropScale"
            type="range"
            min="25"
            max="200"
            step="1"
            class="w-full accent-indigo-500 h-1.5 rounded-full appearance-none bg-gray-200 cursor-pointer"
          />
          <p class="text-xs text-gray-500 mt-1">{{ $t('tool.cropScaleHint') }}</p>
        </div>

        <div class="flex justify-end gap-3">
          <button @click="cancelCrop" class="modern-btn modern-btn-secondary modern-btn-sm">{{ $t('tool.cropCancel') }}</button>
          <button @click="confirmCrop" class="modern-btn modern-btn-primary modern-btn-sm">{{ $t('tool.cropConfirm') }}</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ALL_BRAND_PALETTES } from '~/utils/palettes-data'
import {
  PATTERN_STYLES,
  calcExportCellSize,
  fitTextFontSize,
  maxCodeLength,
  type BeadStyle,
  type PatternStyleKey
} from '~/utils/bead-algorithm'
import { calcBeadLineMetrics } from '~/utils/bead-canvas'
import type { BeadColor, PaletteVariant } from '~/types'
import type { CSSProperties } from 'vue'

const { t } = useI18n()

// ==================== 草稿持久化（刷新 / 重新打开页面后创作内容不遗失） ====================
const DRAFT_KEY = 'bead-studio-draft'
const draftRestored = ref(false)
let restoringDraft = false
let hadDraftBeforeUpload = false

// ==================== State ====================
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const canvasContainer = ref<HTMLDivElement | null>(null)
const previewUrl = ref<string>('')
const imageData = ref<ImageData | null>(null)
const imageFile = ref<File | null>(null)
const result = ref<any>(null)
const processing = ref(false)
const errorMsg = ref<string>('')

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

// Zoom
const zoomLevel = ref(100)

// 预览辅助：四周坐标留白宽度（px），叠加每 10 格辅助网格与 1、10、20… 坐标
const GUIDE_MARGIN = 36

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
const globalReplaceTarget = ref('')
// 笔刷大小（直径，格数）：1、3、5、7
const brushSize = ref(1)
// 撤销栈：每笔（一次按下到抬起）开始前压入一份图案快照
const undoStack = ref<string[][][]>([])
let paintingStroke = false
let brushPaintScheduled = false

// ==================== Computed ====================
const effectiveCellSize = computed(() => {
  const size = parseInt(selectedGridSize.value)
  // Base size fits the 600px container at 100% zoom; zoom scales linearly.
  // No lower clamp, otherwise large grids (150/200) stay stuck at the
  // minimum cell size and zooming appears broken.
  const baseCellSize = Math.floor(600 / size)
  return Math.max(1, Math.floor(baseCellSize * zoomLevel.value / 100))
})

const zoomPercent = computed(() => Math.round(zoomLevel.value))
// 有图（或恢复的草稿图案）即视为有内容，控制工具栏/空状态显隐
const hasImage = computed(() => !!imageData.value || !!result.value)

// 画布是否已有可拼珠的格子（全透明 = 空白画布，不算内容）
const hasCanvasContent = computed(() => {
  const pattern = result.value?.pattern as string[][] | undefined
  if (!pattern?.length) return false
  for (const row of pattern) {
    for (const code of row) {
      if (code && code !== 'TRANSPARENT') return true
    }
  }
  return false
})

// 参数改过但还没重新生成：上传图片后不再自动转换，统一由「生成图纸」按钮触发
const paramsDirty = ref(false)

const currentBrandPalette = computed(() => {
  return brandPalettes.value.find(p => p.id === selectedPaletteId.value) || brandPalettes.value[0]
})

const currentVariants = computed(() => currentBrandPalette.value.variants || [])

// Initialize/reset selectedVariantId when palette changes
watch(selectedPaletteId, () => {
  // 草稿恢复期间不重置变体（恢复逻辑会按草稿设定完整状态）
  if (restoringDraft) return
  const variants = currentVariants.value
  selectedVariantId.value = variants.length > 0 ? variants[0].id : ''
}, { immediate: true })

const currentBrandColors = computed(() => {
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

const selectedColorName = computed(() => {
  if (!selectedColorCode.value) return ''
  const color = currentBrandColors.value.find(c => c.code === selectedColorCode.value)
  return color ? color.name : selectedColorCode.value
})

const selectedColorHex = computed(() => {
  if (!selectedColorCode.value) return '#FFFFFF'
  const color = currentBrandColors.value.find(c => c.code === selectedColorCode.value)
  return color ? color.hex : '#FFFFFF'
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

// ==================== Crop Modal ====================
const showCropModal = ref(false)
// 这次裁剪是「从缩略图重新打开」的（而不是刚上传）：取消时只关弹窗，不能清空已有成果
let cropReopened = false
const cropScale = ref(100) // 25% - 200%
const cropRatios = [
  { key: 'free', labelKey: 'tool.cropFree' },
  { key: '1:1', label: '1:1' },
  { key: '4:3', label: '4:3' },
  { key: '16:9', label: '16:9' },
]
const cropRatio = ref('free')
const sourceCanvas = ref<HTMLCanvasElement | null>(null)
const croppedPreviewUrl = ref('')

// 裁剪选框（单位：原图像素；可为负值/超出原图 → 超出部分透明留白）
const cropBox = reactive({ x: 0, y: 0, w: 100, h: 100 })
const cropHandles = ['nw', 'ne', 'sw', 'se']

// 原图按最大 420px 等比缩放展示
const cropFitScale = computed(() => {
  const src = sourceCanvas.value
  if (!src) return 1
  return Math.min(1, 420 / Math.max(src.width, src.height))
})

const cropStageStyle = computed(() => {
  const src = sourceCanvas.value
  if (!src) return {}
  const f = cropFitScale.value
  return { width: src.width * f + 'px', height: src.height * f + 'px' }
})

const cropImageStyle = computed(() => {
  const src = sourceCanvas.value
  if (!src) return {}
  const f = cropFitScale.value
  return { width: src.width * f + 'px', height: src.height * f + 'px' }
})

const cropBoxStyle = computed(() => {
  const f = cropFitScale.value
  return {
    left: cropBox.x * f + 'px',
    top: cropBox.y * f + 'px',
    width: Math.max(0, cropBox.w * f) + 'px',
    height: Math.max(0, cropBox.h * f) + 'px',
  }
})

const cropHandleStyle = (h: string) => ({
  top: h.includes('n') ? '-5px' : 'auto',
  bottom: h.includes('s') ? '-5px' : 'auto',
  left: h.includes('w') ? '-5px' : 'auto',
  right: h.includes('e') ? '-5px' : 'auto',
  cursor: h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize',
})

// 100% 基准窗口：所选比例在图片内的最大内接矩形（自由=整图）
function computeBaseRect(imgW: number, imgH: number, ratio: string) {
  let bw = imgW
  let bh = imgH
  if (ratio !== 'free') {
    const [rw, rh] = ratio.split(':').map(Number)
    const r = rw / rh
    if (imgW / imgH > r) {
      bh = imgH
      bw = imgH * r
    } else {
      bw = imgW
      bh = imgW / r
    }
  }
  return { w: bw, h: bh }
}

// 比例/缩放变化 → 按基准窗口重新定位（居中），框大小随滑块 25%-200% 缩放
function applyCropScale() {
  const src = sourceCanvas.value
  if (!src) return
  const base = computeBaseRect(src.width, src.height, cropRatio.value)
  const s = cropScale.value / 100
  cropBox.w = base.w * s
  cropBox.h = base.h * s
  cropBox.x = (src.width - cropBox.w) / 2
  cropBox.y = (src.height - cropBox.h) / 2
}

// 生成裁剪结果画布：原图按选框位置绘制，选框超出原图的部分保持透明（留白，不生成拼豆）
function buildCropCanvas(): HTMLCanvasElement | null {
  const src = sourceCanvas.value
  if (!src) return null
  const w = Math.max(1, Math.round(cropBox.w))
  const h = Math.max(1, Math.round(cropBox.h))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(src, Math.round(-cropBox.x), Math.round(-cropBox.y))
  return canvas
}

// 打开弹窗时初始化选框（自由、100%，居中覆盖整图）
function initCropBox() {
  cropScale.value = 100
  cropRatio.value = 'free'
  applyCropScale()
}

// 比例 / 缩放变化 → 重新定位选框并刷新结果
watch([cropScale, cropRatio], () => applyCropScale())

// ==================== Crop Box Drag / Resize ====================
let boxDrag: {
  mode: 'move' | 'resize'
  handle?: string
  startX: number
  startY: number
  box: { x: number; y: number; w: number; h: number }
} | null = null

function startDragBox(e: PointerEvent) {
  if (e.button !== 0) return
  boxDrag = {
    mode: 'move',
    startX: e.clientX,
    startY: e.clientY,
    box: { ...cropBox },
  }
  window.addEventListener('pointermove', onBoxPointerMove)
  window.addEventListener('pointerup', onBoxPointerUp)
  e.preventDefault()
}

function startResizeBox(handle: string, e: PointerEvent) {
  if (e.button !== 0) return
  boxDrag = {
    mode: 'resize',
    handle,
    startX: e.clientX,
    startY: e.clientY,
    box: { ...cropBox },
  }
  window.addEventListener('pointermove', onBoxPointerMove)
  window.addEventListener('pointerup', onBoxPointerUp)
  e.preventDefault()
}

function onBoxPointerMove(e: PointerEvent) {
  if (!boxDrag) return
  const src = sourceCanvas.value
  if (!src) return
  const fit = cropFitScale.value
  const dx = (e.clientX - boxDrag.startX) / fit
  const dy = (e.clientY - boxDrag.startY) / fit
  const b = boxDrag.box
  const minSize = 8 / fit // 最小 8 显示像素

  if (boxDrag.mode === 'move') {
    cropBox.x = b.x + dx
    cropBox.y = b.y + dy
  } else {
    const handle = boxDrag.handle!
    let { x, y, w, h } = b
    if (cropRatio.value === 'free') {
      if (handle.includes('w')) w = Math.max(minSize, b.w - dx)
      if (handle.includes('e')) w = Math.max(minSize, b.w + dx)
      if (handle.includes('n')) h = Math.max(minSize, b.h - dy)
      if (handle.includes('s')) h = Math.max(minSize, b.h + dy)
      if (handle.includes('w')) x = b.x + (b.w - w)
      if (handle.includes('n')) y = b.y + (b.h - h)
    } else {
      // 固定比例：水平方向主导，保持宽高比
      const [rw, rh] = cropRatio.value.split(':').map(Number)
      const ratio = rw / rh
      const newW = handle.includes('w') ? Math.max(minSize, b.w - dx) : Math.max(minSize, b.w + dx)
      const newH = newW / ratio
      w = newW
      h = newH
      if (handle.includes('w')) x = b.x + (b.w - w)
      if (handle.includes('n')) y = b.y + (b.h - h)
    }
    cropBox.x = x
    cropBox.y = y
    cropBox.w = w
    cropBox.h = h
  }
}

function onBoxPointerUp() {
  if (!boxDrag) return
  boxDrag = null
  window.removeEventListener('pointermove', onBoxPointerMove)
  window.removeEventListener('pointerup', onBoxPointerUp)
}

async function confirmCrop() {
  const cropCanvas = buildCropCanvas()
  if (!cropCanvas) return
  const ctx = cropCanvas.getContext('2d')!
  imageData.value = ctx.getImageData(0, 0, cropCanvas.width, cropCanvas.height)
  // 缩略图显示裁剪后的图片
  const url = await new Promise<string>((resolve) => {
    cropCanvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : cropCanvas.toDataURL())
    }, 'image/png')
  })
  if (croppedPreviewUrl.value) URL.revokeObjectURL(croppedPreviewUrl.value)
  croppedPreviewUrl.value = url
  showCropModal.value = false
  cropReopened = false
  // 不自动生成：裁剪结果只更新对照图，用户点「生成图纸」才真正转换
  paramsDirty.value = true
}

/**
 * 点击缩略图重新打开裁剪弹窗。
 * 不重置选框（initCropBox 只在首次上传时调用），用户上次的裁剪范围会保留，改完再确认即可。
 */
function reopenCrop() {
  // 草稿恢复的图只有 imageData（原图 canvas 没被保存下来）：据它补一张底图，
  // 否则裁剪弹窗既没底图、buildCropCanvas 也取不到源，点了会没反应
  let synthesized = false
  if (!sourceCanvas.value && imageData.value) {
    const c = document.createElement('canvas')
    c.width = imageData.value.width
    c.height = imageData.value.height
    c.getContext('2d')!.putImageData(imageData.value, 0, 0)
    sourceCanvas.value = c
    synthesized = true
  }
  if (!sourceCanvas.value) return
  // 上传路径在 loadImage 里已经 initCropBox 过（保留上次选区）；补底图这条要自己初始化
  if (synthesized) initCropBox()
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
  imageFile.value = null
  sourceCanvas.value = null
  errorMsg.value = ''
  paramsDirty.value = false
  // 上传前若已恢复草稿，取消裁剪后恢复草稿，避免创作内容被清空
  if (hadDraftBeforeUpload) {
    hadDraftBeforeUpload = false
    loadDraft()
  }
}

// ==================== Lifecycle ====================
onMounted(() => {
  // 先给一张空白画布：用户不上传图片也能直接在画布上作画
  initBlankCanvas()
  // 恢复上一次留在本地的草稿（图案 + 参数），没有草稿时保持空白画布
  loadDraft()
  // 等色板相关的 watch 落定，画笔颜色才能取到当前套装的有效色号
  nextTick(() => {
    ensureBrushColor()
    renderToken++
    renderPreview()
  })
})

// 自动选择能覆盖图案全部色号的最小套装（草稿恢复时用）
function pickVariantForPattern(pattern: string[][], variants: PaletteVariant[]): string {
  if (!variants || variants.length === 0) return ''
  const used = new Set<string>()
  for (const row of pattern) {
    for (const code of row) {
      if (code && code !== 'TRANSPARENT') used.add(code)
    }
  }
  if (used.size === 0) return variants[0].id
  const covering = variants.filter(v => {
    if (!v.codes || v.codes.length === 0) return false
    const set = new Set(v.codes)
    for (const code of used) if (!set.has(code)) return false
    return true
  })
  if (covering.length > 0) {
    covering.sort((a, b) => (a.colorCount ?? (a.codes?.length ?? 0)) - (b.colorCount ?? (b.codes?.length ?? 0)))
    return covering[0].id
  }
  const sorted = [...variants].sort((a, b) => (b.colorCount ?? (b.codes?.length ?? 0)) - (a.colorCount ?? (a.codes?.length ?? 0)))
  return sorted[0].id
}

onUnmounted(() => {
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
  window.removeEventListener('pointermove', onBoxPointerMove)
  window.removeEventListener('pointerup', onBoxPointerUp)
  window.removeEventListener('mousemove', onBrushMouseMove)
  window.removeEventListener('mouseup', onBrushMouseUp)
})

// 影响转换的参数：不再自动重新生成，只标记「待生成」，由用户点「生成图纸」
// 修改图纸大小：有原图时等生成；没有原图时，空白画布直接按新宽度重建
watch(selectedGridSize, () => {
  if (restoringDraft) return
  if (imageData.value) {
    paramsDirty.value = true
    return
  }
  // 已有手绘内容时保持不动，避免改宽度把画的东西清掉
  if (!hasCanvasContent.value) resetToBlankCanvas()
})

// 切换色板/套餐：当前选中色不在新套餐内时重置；色板变化先重绘，真正重新量化仍要点生成
watch([selectedPaletteId, selectedVariantId], () => {
  if (restoringDraft) return
  if (selectedColorCode.value && !currentBrandColors.value.some(c => c.code === selectedColorCode.value)) {
    selectedColorCode.value = null
    patternSnapshot.value = null
  }
  if (imageData.value) paramsDirty.value = true
  ensureBrushColor()
  if (result.value) scheduleRender()
}, { deep: true })

// 切换图纸风格（降采样 + 颜色距离 + 降噪）：必须点「生成图纸」才重新量化
watch(patternStyle, () => {
  if (restoringDraft) return
  if (imageData.value) paramsDirty.value = true
})

// 缩放：rAF 节流按目标尺寸重绘；空白画布同样要实时生效，不能依赖 imageData
watch(zoomLevel, () => {
  if (result.value) {
    scheduleZoomRender()
  }
})

// 样式/辅助开关：仅防抖重绘（有 result 即可，无需依赖原图）
watch([selectedStyle, showGuideGrid, showGuideCoords, labelStep], () => {
  if (result.value) {
    scheduleRender()
  }
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
  paintingStroke = false
  brushEnabled.value = false
  eraserEnabled.value = false
  replaceEnabled.value = false
  showColorPicker.value = false
  paramsDirty.value = false
  ensureBrushColor()
  renderToken++
  nextTick(() => renderPreview())
}

/** 页面初始化：没有草稿 / 编辑项目时，先给一张可绘制的空白画布 */
function initBlankCanvas() {
  if (result.value) return
  resetToBlankCanvas()
}

/**
 * 清空画布 + 上传的图片 + 预览图，回到一张新的空白画布。
 * confirm=true 时二次确认（预览区的 × 与「清空画布」按钮）；丢弃草稿时不确认。
 */
function doClearCanvas(confirm: boolean) {
  const hasAnything = !!imageData.value || !!previewUrl.value || hasCanvasContent.value
  if (confirm && hasAnything && !window.confirm(t('tool.clearCanvasConfirm'))) return

  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  if (croppedPreviewUrl.value) URL.revokeObjectURL(croppedPreviewUrl.value)
  previewUrl.value = ''
  croppedPreviewUrl.value = ''
  imageData.value = null
  imageFile.value = null
  sourceCanvas.value = null
  errorMsg.value = ''
  showCropModal.value = false
  showColorPicker.value = false
  hadDraftBeforeUpload = false
  draftRestored.value = false
  clearDraft()
  window.removeEventListener('mousemove', onBrushMouseMove)
  window.removeEventListener('mouseup', onBrushMouseUp)
  // 清空后的空白画布固定回到 100% 缩放与左上角，避免沿用旧缩放/滚动位置产生“缩放后的效果”
  zoomLevel.value = 100
  resetToBlankCanvas()
  // 先清掉旧位图再重绘，避免残留上一张图
  const canvas = previewCanvas.value
  if (canvas) {
    canvas.width = 0
    canvas.height = 0
  }
  nextTick(() => {
    renderToken++
    renderPreview()
    const container = canvasContainer.value
    if (container) {
      container.scrollLeft = 0
      container.scrollTop = 0
    }
  })
}

/** 工具栏「清空画布」按钮 / 预览图 × */
function clearCanvas() {
  doClearCanvas(true)
}

/** 手动生成：上传 / 裁剪图片后由用户点击，不再自动转换 */
function onGenerate() {
  if (!imageData.value) return
  if (hasCanvasContent.value && !window.confirm(t('tool.generateClearsCanvas'))) return
  // 生成成功后 convertImage 会清掉 paramsDirty；失败时保留，方便用户重试
  convertImage()
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
  // 记录上传前是否已恢复草稿：取消裁剪时可恢复，避免内容遗失
  hadDraftBeforeUpload = draftRestored.value
  cropReopened = false
  imageFile.value = file
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
    initCropBox()
    showCropModal.value = true
  }
  img.onerror = () => {
    errorMsg.value = t('tool.loadFailed')
  }
  img.src = previewUrl.value
}

// ==================== Debounced re-render (zoom / style) ====================
// Bumped whenever the pattern content changes so the render cache is invalidated
let renderToken = 0
let renderTimer: ReturnType<typeof setTimeout> | null = null

// 已渲染内容尺寸（canvas 像素尺寸，不含任何 transform）
const lastRenderedW = ref(0)
const lastRenderedH = ref(0)

// 包裹层尺寸 = 渲染尺寸；canvas 直接以自身像素尺寸显示。
// 不做 CSS transform 瞬态缩放：非整数 scale 放大像素画时，像素块边缘落在
// 亚像素位置会逐帧取整跳动（抖动），且重绘瞬间新旧画面尺寸不一致会闪跳。
const previewWrapStyle = computed(() => ({
  width: `${lastRenderedW.value}px`,
  height: `${lastRenderedH.value}px`,
}))

const previewCanvasStyle = computed<CSSProperties>(() => ({
  'image-rendering': 'pixelated',
  position: 'absolute',
  left: '0',
  top: '0',
}))

function scheduleRender() {
  if (renderTimer) {
    clearTimeout(renderTimer)
  }
  renderTimer = setTimeout(() => {
    renderTimer = null
    renderPreview()
  }, 100)
}

// 缩放（zoomLevel 变化）直接用 rAF 节流按目标尺寸重绘：
// canvas 始终以最终 cellSize 绘制，像素对齐、无亚像素抖动；
// 重绘完成后在 renderPreview 内按鼠标锚点/视口中心调整滚动位置。
let zoomRenderRaf = 0
function scheduleZoomRender() {
  if (zoomRenderRaf) cancelAnimationFrame(zoomRenderRaf)
  zoomRenderRaf = requestAnimationFrame(() => {
    zoomRenderRaf = 0
    renderPreview()
  })
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
    const stylePreset = PATTERN_STYLES[patternStyle.value as PatternStyleKey] ?? PATTERN_STYLES.detail
    const conversionResult = convertImageToBeadPattern({
      imageData: imageData.value,
      targetWidth: size,
      targetHeight,
      palette: currentBrandColors.value,
      // 图纸风格决定「降采样方式 + 颜色距离 + 降噪强度（+ 扁平的配色数）」，不要在这里散写具体数值
      ...stylePreset,
    })

    result.value = conversionResult
    patternSnapshot.value = null
    selectedColorCode.value = null
    paramsDirty.value = false
    undoStack.value = []
    ensureBrushColor()
    renderToken++
    await renderPreview()
    saveDraft()
    // 完成新一次转换后，不再显示“草稿已恢复”提示
    draftRestored.value = false
  } catch (e) {
    console.error('Conversion failed:', e)
    errorMsg.value = t('tool.conversionFailed', { message: e instanceof Error ? e.message : 'Unknown error' })
  } finally {
    processing.value = false
  }
}

// ==================== Canvas rendering ====================
let lastRenderKey = ''
let lastRenderedCellSize = -1

// 在指定画布上绘制辅助网格与坐标（预览与导出共用，跟随开关状态）
function drawGuideOverlay(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  cellSize: number,
  canvasW: number,
  canvasH: number,
  guideMargin: number,
  coordFontSize = 12,
  labelStep = 10
) {
  // 辅助网格：每 10 格一条深色线（只画在珠子区域内，避免与坐标留白区的数字重叠）
  if (showGuideGrid.value) {
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    // 线宽按格子等比缩放：写死 1px 时，缩到 25% 会让线比格子还粗（见 utils/bead-canvas.ts）
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

  // 坐标：四面标注，标 1、step、2×step…（起点标 1，此后每个 labelStep 格边界标一次）
  if (showGuideCoords.value) {
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

async function renderPreview() {
  if (!result.value || !currentBrandPalette.value || !previewCanvas.value) return

  const cellSize = effectiveCellSize.value
  const style = selectedStyle.value
  // Skip when nothing actually changed (e.g. zoom steps that round to the same cell size)
  // 加入调色板/套装标识，确保切换色板（无原图场景）时也能触发重绘
  const renderKey = `${renderToken}|${cellSize}|${style}|${selectedPaletteId.value}|${selectedVariantId.value}|${showGuideGrid.value}|${showGuideCoords.value}|${labelStep.value}`
  if (renderKey === lastRenderKey) return
  lastRenderKey = renderKey

  // 仅当格大小变化时按图片中心锚定视口（颜色替换等重绘不打断用户浏览位置）
  const cellSizeChanged = cellSize !== lastRenderedCellSize
  lastRenderedCellSize = cellSize
  // 渲染前的旧画布尺寸：重绘后按比例调整滚动位置（缩放锚点）
  const oldW = lastRenderedW.value
  const oldH = lastRenderedH.value

  const pattern = result.value.pattern
  const cols = pattern[0].length
  const rows = pattern.length

  // 坐标开启时四周预留留白；关闭则不留白
  const guideMargin = showGuideCoords.value ? GUIDE_MARGIN : 0

  const { createBeadCanvas } = await import('~/utils/bead-algorithm')
  const beadCanvas = createBeadCanvas(
    pattern,
    currentBrandColors.value,
    cellSize,
    style,
    false // 预览不显示色号
  )

  const canvasW = cols * cellSize + guideMargin * 2
  const canvasH = rows * cellSize + guideMargin * 2
  previewCanvas.value.width = canvasW
  previewCanvas.value.height = canvasH
  const ctx = previewCanvas.value.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#F0F0F0'
  ctx.fillRect(0, 0, canvasW, canvasH)
  ctx.drawImage(beadCanvas, guideMargin, guideMargin)

  // 辅助网格 + 坐标（跟随开关）
  drawGuideOverlay(ctx, cols, rows, cellSize, canvasW, canvasH, guideMargin, 12, labelStep.value)

  // 记录本次渲染的尺寸（canvas 像素尺寸）
  lastRenderedW.value = canvasW
  lastRenderedH.value = canvasH

  // 格大小变化时的视口锚定（重绘完成后调整滚动，保证缩放以鼠标/中心为锚）：
  // - 鼠标滚轮缩放（800ms 内）：以鼠标位置为锚点，按画布尺寸变化比例平移滚动，
  //   让鼠标下的内容点在缩放后仍停留在鼠标位置（以鼠标为中心缩放）
  // - 滑块/按钮缩放 / 初次渲染：保持图片中心在可视区中心
  if (cellSizeChanged) {
    const keepViewport = zoomFromWheel && Date.now() - lastWheelAt < 800
    const el = canvasContainer.value
    if (keepViewport && lastWheelCursor && oldW > 0 && oldH > 0 && el) {
      const ratioW = canvasW / oldW
      const ratioH = canvasH / oldH
      el.scrollLeft = (el.scrollLeft + lastWheelCursor.x) * ratioW - lastWheelCursor.x
      el.scrollTop = (el.scrollTop + lastWheelCursor.y) * ratioH - lastWheelCursor.y
    } else {
      requestAnimationFrame(() => {
        if (el) {
          el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
          el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
        }
      })
    }
  }
}

// ==================== Wheel Zoom ====================
// 记录最近一次滚轮缩放时鼠标相对预览容器的偏移，供"以鼠标位置为锚点缩放"使用
let lastWheelCursor: { x: number; y: number } | null = null
let lastWheelAt = 0
let zoomFromWheel = false

function handleWheelZoom(event: WheelEvent) {
  // 指数步进（每次 ±10%）：缩放过程连续平滑，格子大小随之按比例变化，
  // 不会像线性步进那样在大图纸上出现"转一格但格子大小不变"的 dead zone
  const factor = event.deltaY > 0 ? 1 / 1.1 : 1.1
  const el = canvasContainer.value
  if (el) {
    const rect = el.getBoundingClientRect()
    // 容器有 padding（四周留白），鼠标偏移必须换算为内容区坐标系（与 scrollLeft 一致），
    // 否则缩放锚点会偏移 padding 距离，导致"缩放没对准鼠标"
    const cs = getComputedStyle(el)
    const padLeft = parseFloat(cs.paddingLeft) || 0
    const padTop = parseFloat(cs.paddingTop) || 0
    lastWheelCursor = {
      x: event.clientX - rect.left - padLeft,
      y: event.clientY - rect.top - padTop,
    }
    lastWheelAt = Date.now()
    zoomFromWheel = true
  }
  zoomLevel.value = Math.max(25, Math.min(300, Math.round(zoomLevel.value * factor * 10) / 10))
}

// ==================== Drag to Pan ====================
// 按住预览区域（含四周留白）拖动即可平移视口；拖动过阈值时抑制画布点击选色
let dragState: { startX: number; startY: number; scrollLeft: number; scrollTop: number; moved: boolean } | null = null
let suppressClick = false

function onCanvasContainerMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  // 画笔/橡皮擦模式下禁止拖拽平移，避免与涂画手势冲突
  if (brushEnabled.value || eraserEnabled.value) return
  const el = canvasContainer.value
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
    const el = canvasContainer.value
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

// ==================== 色号悬停提示 ====================
const previewHoverTip = ref<{ x: number; y: number; text: string } | null>(null)
let previewColorMap = new Map<string, { code: string; name: string }>()

function onCanvasMouseMove(e: MouseEvent) {
  if (!result.value || !previewCanvas.value || !canvasContainer.value) return
  const canvas = previewCanvas.value
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  // 与 paintCellAt 一致：减去坐标留白映射到画布坐标（canvas 以自身像素尺寸显示，无缩放变换）
  const margin = showGuideCoords.value ? GUIDE_MARGIN : 0
  const x = e.clientX - rect.left - margin
  const y = e.clientY - rect.top - margin
  const cellSize = effectiveCellSize.value
  const gridX = Math.floor(x / cellSize)
  const gridY = Math.floor(y / cellSize)
  const pattern = result.value.pattern
  const rows = pattern.length
  const cols = pattern[0].length
  if (gridY >= 0 && gridY < rows && gridX >= 0 && gridX < cols) {
    const code = pattern[gridY][gridX]
    if (code && code !== 'TRANSPARENT') {
      const bead = previewColorMap.get(code)
      const text = bead ? `${bead.code}${bead.name ? ' · ' + bead.name : ''}` : code
      // 用视口坐标（fixed 定位 + Teleport），避免被容器 overflow/z-index 裁剪
      previewHoverTip.value = { x: e.clientX, y: e.clientY, text }
      return
    }
  }
  previewHoverTip.value = null
}

function onCanvasMouseLeave() {
  previewHoverTip.value = null
}

// 当色板/套装变化时重建色号查找表
watch(currentBrandColors, (colors) => {
  previewColorMap = new Map()
  for (const c of colors) previewColorMap.set(c.code, { code: c.code, name: c.name || '' })
}, { immediate: true })

// ==================== Canvas Click — Select Color ====================
function handleCanvasClick(event: MouseEvent) {
  // 涂画类模式下点击已由 mousedown 完成，这里直接忽略
  if (brushEnabled.value || eraserEnabled.value || replaceEnabled.value) return
  // 拖动结束后的点击不触发选色
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (!result.value || !previewCanvas.value) return

  const canvas = previewCanvas.value
  const rect = canvas.getBoundingClientRect()
  // 减去坐标留白（与渲染时一致），映射到珠子网格区域
  // （canvas 以自身像素尺寸显示，无缩放变换，无需坐标还原）
  const margin = showGuideCoords.value ? GUIDE_MARGIN : 0
  const x = event.clientX - rect.left - margin
  const y = event.clientY - rect.top - margin
  const cellSize = effectiveCellSize.value

  const gridX = Math.floor(x / cellSize)
  const gridY = Math.floor(y / cellSize)
  const pattern = result.value.pattern

  if (gridY >= 0 && gridY < pattern.length && gridX >= 0 && gridX < pattern[0].length) {
    const code = pattern[gridY][gridX]
    // 点画布选色只作为「整体替换」的快捷入口；透明格没有可替换的颜色
    if (code && code !== 'TRANSPARENT') {
      selectedColorCode.value = code
      globalReplaceTarget.value = ''
      colorPickerMode.value = 'global'
      showColorPicker.value = true
    }
  }
}

// ==================== Color Selection & Replacement ====================
/** 打开画笔 / 替色的选色弹窗 */
function openBrushColorPicker() {
  ensureBrushColor()
  colorPickerMode.value = replaceEnabled.value ? 'replace' : 'brush'
  showColorPicker.value = true
}

const colorPickerTitle = computed(() => {
  if (colorPickerMode.value === 'global') return `${t('tool.globalReplace')} ${selectedColorCode.value || ''}`.trim()
  if (colorPickerMode.value === 'replace') return t('tool.replace')
  return t('tool.brushSelectColor')
})

/** 弹窗内选色：画笔/替色选中即关闭；整体替换只记录目标色，等确定 */
function onColorPicked(code: string) {
  if (colorPickerMode.value === 'global') {
    globalReplaceTarget.value = code
    return
  }
  brushColor.value = code
  showColorPicker.value = false
}

function closeColorPicker() {
  showColorPicker.value = false
  selectedColorCode.value = null
  globalReplaceTarget.value = ''
}

/** 颜色统计行「整体替换」：打开选色弹窗，选目标色后确定 */
function onStatsReplace(stat: { colorCode: string }) {
  if (!stat?.colorCode) return
  selectedColorCode.value = stat.colorCode
  globalReplaceTarget.value = ''
  patternSnapshot.value = null
  colorPickerMode.value = 'global'
  showColorPicker.value = true
}

function confirmGlobalReplace() {
  const from = selectedColorCode.value
  const to = globalReplaceTarget.value
  if (!from || !to || from === to) return
  replaceColor(from, to)
  closeColorPicker()
}

function replaceColor(oldCode: string, newCode: string) {
  if (!result.value || oldCode === newCode) return

  // 首次替换前保存原始图案，供“重置”一键恢复
  if (!patternSnapshot.value) {
    patternSnapshot.value = result.value.pattern.map((row: string[]) => [...row])
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
  renderToken++
  renderPreview()
  // 选中色更新为新色，选色板保持展开，可继续替换或重置
  selectedColorCode.value = newCode
  saveDraft()
}

// 重置：恢复替换前的原始图案
function resetColor() {
  if (!result.value || !patternSnapshot.value) return
  result.value.pattern = patternSnapshot.value
  patternSnapshot.value = null
  selectedColorCode.value = null
  recalculateStats()
  renderToken++
  renderPreview()
  saveDraft()
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
    .sort((a: any, b: any) => b.count - a.count)

  result.value.totalBeads = result.value.stats.reduce((sum: number, s: any) => sum + s.count, 0)
}

// ==================== Brush 画笔涂画 ====================
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
  } else {
    stopPainting()
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
  } else {
    stopPainting()
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
  } else {
    stopPainting()
  }
}

// 结束当前涂画手势并解绑全局监听
function stopPainting() {
  paintingStroke = false
  window.removeEventListener('mousemove', onBrushMouseMove)
  window.removeEventListener('mouseup', onBrushMouseUp)
}

// 一笔开始前压入当前图案快照，用于撤销（最多保留 50 步）
function pushUndo() {
  if (!result.value) return
  undoStack.value.push(result.value.pattern.map((row: string[]) => [...row]))
  if (undoStack.value.length > 50) undoStack.value.shift()
}

function undoPaint() {
  const snapshot = undoStack.value.pop()
  if (!snapshot || !result.value) return
  result.value.pattern = snapshot
  recalculateStats()
  renderToken++
  renderPreview()
  saveDraft()
}

// 将鼠标位置映射到格子并涂画，返回是否实际修改了图案
// 画笔写入 brushColor；橡皮擦直接擦成 TRANSPARENT；替色只改单格；画笔按 brushSize 扩展
function paintCellAt(e: MouseEvent): boolean {
  if (!result.value || !previewCanvas.value) return false
  const canvas = previewCanvas.value
  const rect = canvas.getBoundingClientRect()
  // 与渲染一致：减去坐标留白映射到画布坐标（canvas 以自身像素尺寸显示，无缩放变换）
  const margin = showGuideCoords.value ? GUIDE_MARGIN : 0
  const x = e.clientX - rect.left - margin
  const y = e.clientY - rect.top - margin
  const cellSize = effectiveCellSize.value
  const gridX = Math.floor(x / cellSize)
  const gridY = Math.floor(y / cellSize)
  const pattern = result.value.pattern
  const rows = pattern.length
  const cols = pattern[0].length
  // 替色是单格替换，不跟笔刷大小走
  const radius = replaceEnabled.value ? 0 : Math.floor(brushSize.value / 2)
  let changed = false
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cy = gridY + dy
      const cx = gridX + dx
      if (cy < 0 || cy >= rows || cx < 0 || cx >= cols) continue
      // 橡皮擦直接擦成透明格（不再恢复生成时的原图颜色）
      const val = eraserEnabled.value ? 'TRANSPARENT' : brushColor.value
      if (pattern[cy][cx] === val) continue
      pattern[cy][cx] = val
      changed = true
    }
  }
  return changed
}

/** 鼠标是否落在图纸格子内：点留白不产生空撤销步，避免「撤销看不出变化」 */
function pointInGrid(e: MouseEvent): boolean {
  if (!result.value || !previewCanvas.value) return false
  const rect = previewCanvas.value.getBoundingClientRect()
  const margin = showGuideCoords.value ? GUIDE_MARGIN : 0
  const cellSize = effectiveCellSize.value
  const gridX = Math.floor((e.clientX - rect.left - margin) / cellSize)
  const gridY = Math.floor((e.clientY - rect.top - margin) / cellSize)
  const pattern = result.value.pattern
  return gridY >= 0 && gridY < pattern.length && gridX >= 0 && gridX < pattern[0].length
}

function onCanvasMouseDown(e: MouseEvent) {
  if ((!brushEnabled.value && !eraserEnabled.value && !replaceEnabled.value) || e.button !== 0) return
  if (!result.value || !previewCanvas.value) return
  // 画笔 / 替色还没拿到有效颜色时不要落笔
  if ((brushEnabled.value || replaceEnabled.value) && !brushColor.value) return
  // 点在画布留白 / 图外：不开始这一笔（否则会压入一个什么都没改的撤销快照）
  if (!pointInGrid(e)) return
  e.preventDefault()
  e.stopPropagation() // 阻止容器拖拽平移
  if (!paintingStroke) {
    paintingStroke = true
    pushUndo()
  }
  if (paintCellAt(e)) scheduleBrushRender()
  window.addEventListener('mousemove', onBrushMouseMove)
  window.addEventListener('mouseup', onBrushMouseUp)
}

function onBrushMouseMove(e: MouseEvent) {
  if (!paintingStroke) return
  if (paintCellAt(e)) scheduleBrushRender()
}

function onBrushMouseUp() {
  if (!paintingStroke) return
  paintingStroke = false
  window.removeEventListener('mousemove', onBrushMouseMove)
  window.removeEventListener('mouseup', onBrushMouseUp)
}

// 涂画后以 rAF 节流重绘（快速拖动时避免每帧多次全量重绘）
function scheduleBrushRender() {
  if (brushPaintScheduled) return
  brushPaintScheduled = true
  requestAnimationFrame(() => {
    brushPaintScheduled = false
    if (!result.value) return
    renderToken++
    renderPreview()
    saveDraft()
  })
}

// ==================== Export ====================
// 导出格子优先 48px（色号清晰可读），超长图纸自动缩小避免画布过大（画布上限 4500px）
const EXPORT_CELL_SIZE = 48
const EXPORT_CANVAS_CAP = 4500
// 画布硬上限：色号读不清时允许放宽到这里，保证长色号（长色号示例 8 字符）仍导得出来
const EXPORT_CANVAS_MAX = 8192

async function exportPng() {
  if (!result.value || !currentBrandPalette.value) return

  // 导出始终显示色号。
  // 辅助网格与坐标随开关状态一并绘制到导出图，方格线、步长随格子成比例放大。
  const { createBeadCanvas } = await import('~/utils/bead-algorithm')
  const pattern = result.value.pattern
  const cols = pattern[0].length
  const rows = pattern.length

  // 整体放大：优先 48px 格子（色号可读），超出画布上限时按比例缩小（下限 4px）。
  // 色号越长，能读清所需的最小格子越大（`AB-12345` 这种 8 字符色号要 48px，短色号 24px 就够），
  // 所以这条决策要看图案里最长的色号 —— 否则大图纸会把色号整片省略，等于白导。
  const exportCellSize = calcExportCellSize(rows, cols, maxCodeLength(pattern), {
    idealCell: EXPORT_CELL_SIZE,
    softCap: EXPORT_CANVAS_CAP,
    hardCap: EXPORT_CANVAS_MAX
  })

  // 坐标开启时四周预留留白；关闭则不留白
  const guideMargin = showGuideCoords.value ? GUIDE_MARGIN : 0

  const beadCanvas = createBeadCanvas(
    pattern,
    currentBrandColors.value,
    exportCellSize,
    selectedStyle.value,
    true, // 色号
    true  // crisp 整数像素对齐
  )

  const canvasW = cols * exportCellSize + guideMargin * 2
  const canvasH = rows * exportCellSize + guideMargin * 2
  // 底部颜色统计区（直接画进图纸，导出的图片自带配色信息）
  const stats = result.value.stats || []
  const { statH } = getStatLayout(canvasW, stats)

  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = canvasW
  exportCanvas.height = canvasH + statH
  const ctx = exportCanvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#F0F0F0'
  ctx.fillRect(0, 0, canvasW, canvasH)
  ctx.drawImage(beadCanvas, guideMargin, guideMargin)

  // 辅助网格 + 坐标（跟随开关）
  drawGuideOverlay(ctx, cols, rows, exportCellSize, canvasW, canvasH, guideMargin, 16, labelStep.value)
  // 颜色统计区（布局参照编辑图纸的 grid 布局）
  if (statH > 0) drawStatBlock(ctx, canvasW, canvasH, stats)

  const link = document.createElement('a')
  link.download = `bead-pattern-${selectedStyle.value}.png`
  link.href = exportCanvas.toDataURL()
  link.click()
}

// 成品图底部颜色统计区：仿编辑 Tab 的 grid 布局（多列圆角格子：圆色块 + 色号 + 数量上下居中）
function drawStatBlock(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  stats: { colorCode: string; count: number; hex: string }[]
) {
  if (!stats || !stats.length) return
  const layout = getStatLayout(W, stats)
  const { pad, titleH, gap, colCount, cellW, cellH, rowCount, statH } = layout
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
  ctx.fillText(t('tool.colorStats'), pad, H + pad + titleH / 2)
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
    ctx.fillText(`${s.count}颗`, cx, gy + 8 + sw + 7 + 15 + 6)
  })
}

interface StatLayout {
  pad: number
  titleH: number
  gap: number
  colCount: number
  cellW: number
  cellH: number
  rowCount: number
  statH: number
}

// 统计区布局：仿编辑 Tab 的 grid（auto-fill minmax）——每行尽量多放格子，总高限 800px
function getStatLayout(W: number, stats: { colorCode: string }[]): StatLayout {
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

// 圆角矩形路径（用于统计格子背景）
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function exportPdf() {
  if (!result.value) return
  window.print()
}

// ==================== 草稿持久化（刷新 / 重新打开页面后创作内容不遗失） ====================
// 保存草稿：图案 + 当前工具设置，存入 localStorage（纯本地，不联网）
function saveDraft() {
  if (!result.value || !currentBrandPalette.value) return
  try {
    const draft = {
      pattern: result.value.pattern,
      stats: result.value.stats,
      totalBeads: result.value.totalBeads,
      paletteId: selectedPaletteId.value,
      variantId: selectedVariantId.value,
      gridSize: selectedGridSize.value,
      beadSize: beadSize.value,
      style: selectedStyle.value,
      savedAt: Date.now(),
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // localStorage 不可用时忽略（如隐私模式）
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
  draftRestored.value = false
}

// 页面加载时恢复上一次的草稿
function loadDraft() {
  let raw = ''
  try {
    raw = localStorage.getItem(DRAFT_KEY) || ''
  } catch {
    return
  }
  if (!raw) return
  let draft: any
  try {
    draft = JSON.parse(raw)
  } catch {
    return
  }
  if (!draft?.pattern || !Array.isArray(draft.pattern) || draft.pattern.length === 0) return

  restoringDraft = true
  selectedPaletteId.value = draft.paletteId || selectedPaletteId.value
  // 恢复套装；旧草稿未保存该字段时自动选择能覆盖图案全部色号的最小套装
  selectedVariantId.value = draft.variantId || pickVariantForPattern(draft.pattern, currentVariants.value)
  selectedGridSize.value = draft.gridSize || '52'
  beadSize.value = draft.beadSize === '2.6MM' ? '2.6MM' : '5MM'
  selectedStyle.value = draft.style || 'grid-square'
  result.value = {
    pattern: draft.pattern,
    stats: draft.stats || [],
    totalBeads: draft.totalBeads || 0,
  }
  restoringDraft = false
  draftRestored.value = true
  ensureBrushColor()
  renderToken++
  nextTick(() => renderPreview())
}

// 丢弃草稿：清空上传流程与编辑器状态，回到一张干净的空白画布
// （用户已经点了「丢弃」，不再二次确认）
function discardDraft() {
  doClearCanvas(false)
}

// 任一弹窗打开时锁定整页滚动，避免移动端弹窗内部滚动穿透到浏览器整页
useScrollLock([showCropModal])
</script>