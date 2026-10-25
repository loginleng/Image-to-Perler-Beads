<template>
  <!-- Export Button：空白画布没有可导出内容（显隐由页面控制） -->
  <div class="flex flex-wrap gap-3 mt-4">
    <button @click="onExport" class="modern-btn modern-btn-primary modern-btn-sm">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
      {{ $t('tool.exportPng') }}
    </button>
  </div>
</template>

<script setup lang="ts">
// 导出条：只负责把当前图纸导出成 PNG（含坐标/色号/统计区），绘制逻辑在 utils/bead-export.ts
import type { BeadStyle, ColorStat } from '~/utils/bead-algorithm'
import { exportPatternPng } from '~/utils/bead-export'
import type { BeadColor } from '~/types'

const props = defineProps<{
  pattern: string[][]
  colors: BeadColor[]
  beadStyle: BeadStyle
  stats: ColorStat[]
  showGrid: boolean
  showCoords: boolean
  labelStep: number
}>()

const { t } = useI18n()

function onExport() {
  if (!props.pattern?.length) return
  exportPatternPng({
    pattern: props.pattern,
    colors: props.colors,
    beadStyle: props.beadStyle,
    stats: props.stats || [],
    showGrid: props.showGrid,
    showCoords: props.showCoords,
    labelStep: props.labelStep,
    statsTitle: t('tool.colorStats'),
    beadUnit: t('tool.beadUnit'),
  })
}
</script>
