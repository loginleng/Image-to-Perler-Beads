<template>
  <!-- 功能工具栏（分组布局：视图 | 工具 | 笔刷设置 | 编辑） -->
  <div class="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-100">
    <!-- 视图组 -->
    <div class="flex items-center gap-2 pr-2 mr-1 border-r border-gray-200">
      <button
        type="button"
        @click="emit('update:showGrid', !showGrid)"
        class="px-2.5 py-1 rounded-md text-xs font-medium border transition-all"
        :class="showGrid ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'"
      >{{ $t('tool.grid') }}</button>
      <button
        type="button"
        @click="emit('update:showCoords', !showCoords)"
        class="px-2.5 py-1 rounded-md text-xs font-medium border transition-all"
        :class="showCoords ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'"
      >{{ $t('tool.coords') }}</button>
      <label class="flex items-center gap-1.5 text-xs text-gray-500" :title="$t('tool.coordStepTitle')">
        {{ $t('tool.coordStep', { n: labelStep }) }}
        <select
          :value="labelStep"
          @change="emit('update:labelStep', Number(($event.target as HTMLSelectElement).value))"
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
        @click="emit('toggle-brush')"
        class="px-2.5 py-1 rounded-md text-xs font-medium border transition-all flex items-center gap-1.5"
        :class="brushEnabled ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.812a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" /></svg>
        {{ $t('tool.brush') }}
      </button>
      <button
        type="button"
        @click="emit('toggle-eraser')"
        class="px-2.5 py-1 rounded-md text-xs font-medium border transition-all flex items-center gap-1.5"
        :class="eraserEnabled ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 20h12M4.5 15.5L15.086 4.914a2 2 0 012.828 0l1.172 1.172a2 2 0 010 2.828L8.5 19.5a2 2 0 01-1.414.586L4.5 20v-4.5z" /></svg>
        {{ $t('tool.eraser') }}
      </button>
      <button
        type="button"
        @click="emit('toggle-replace')"
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
        @click="emit('open-color')"
        class="px-2.5 py-1 rounded-md text-xs font-medium border transition-all flex items-center gap-1.5 bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
      >
        <span class="w-4 h-4 rounded-sm border border-black/20 shrink-0" :style="{ backgroundColor: brushColorHex }"></span>
        {{ brushColorName }}
      </button>
      <template v-if="brushEnabled">
        <label class="text-xs text-gray-500 shrink-0">{{ $t('tool.brushSize') }}:</label>
        <select
          :value="brushSize"
          @change="emit('update:brushSize', Number(($event.target as HTMLSelectElement).value))"
          class="modern-select"
          style="padding: 4px 8px; font-size: 12px; width: 72px;"
        >
          <option :value="1">1×1</option>
          <option :value="3">3×3</option>
          <option :value="5">5×5</option>
          <option :value="7">7×7</option>
        </select>
      </template>
      <span v-else class="text-[11px] text-gray-400">单格替换</span>
    </div>

    <!-- 编辑组：撤销常驻（只要画布有内容/历史就可见，不随工具切换消失） -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        @click="emit('undo')"
        :disabled="!canUndo"
        class="px-2.5 py-1 rounded-md text-xs font-medium border transition-all flex items-center gap-1.5"
        :class="canUndo ? 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100' : 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed'"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
        {{ $t('tool.undo') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// 预览区工具栏：视图开关 / 工具切换 / 笔刷设置 / 撤销。
// 纯展示组件——状态全部由页面持有，这里只发意图，避免出现两份真相。
withDefaults(defineProps<{
  showGrid: boolean
  showCoords: boolean
  labelStep: number
  labelSteps: number[]
  brushEnabled: boolean
  eraserEnabled: boolean
  replaceEnabled: boolean
  brushColorHex: string
  brushColorName: string
  brushSize: number
  canUndo: boolean
}>(), {
  brushColorHex: '#FFFFFF',
  brushColorName: '',
})

const emit = defineEmits<{
  (e: 'update:showGrid', value: boolean): void
  (e: 'update:showCoords', value: boolean): void
  (e: 'update:labelStep', value: number): void
  (e: 'update:brushSize', value: number): void
  (e: 'toggle-brush'): void
  (e: 'toggle-eraser'): void
  (e: 'toggle-replace'): void
  (e: 'open-color'): void
  (e: 'undo'): void
}>()
</script>
