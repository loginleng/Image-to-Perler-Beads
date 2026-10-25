<template>
  <!-- 选色弹窗：画笔 / 替色 / 颜色统计整体替换共用，浮层展示不占页面布局 -->
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    @mousedown.self="emit('close')"
  >
    <div class="modern-card flex max-h-[80vh] w-full max-w-lg flex-col p-4">
      <div class="mb-3 flex items-center justify-between gap-3">
        <h3 class="truncate text-base font-bold text-gray-900">{{ title }}</h3>
        <button
          type="button"
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          @click="emit('close')"
        >×</button>
      </div>

      <!-- 整体替换：展示源色 → 目标色；选目标色后点确定 -->
      <div v-if="mode === 'global'" class="mb-2 flex items-center gap-2 text-xs text-gray-600">
        <span class="h-4 w-4 rounded border border-gray-200" :style="{ backgroundColor: sourceHex }"></span>
        <span class="font-mono">{{ sourceCode }}</span>
        <span>→</span>
        <span class="h-4 w-4 rounded border border-gray-200" :style="{ backgroundColor: targetHex || 'transparent' }"></span>
        <span class="font-mono">{{ target || $t('tool.selectColor') }}</span>
      </div>

      <div class="min-h-0 flex-1">
        <ColorPicker
          :colors="colors"
          :selected="mode === 'global' ? target : brushCode"
          max-height="52vh"
          @select="onPick"
        />
      </div>

      <div v-if="mode === 'global'" class="mt-3 flex justify-end gap-2">
        <button type="button" class="modern-btn modern-btn-secondary modern-btn-sm" @click="emit('close')">
          {{ $t('tool.close') }}
        </button>
        <button
          type="button"
          class="modern-btn modern-btn-primary modern-btn-sm"
          :disabled="!target || target === sourceCode"
          :class="{ 'opacity-50 cursor-not-allowed': !target || target === sourceCode }"
          @click="target && emit('confirm-global', target)"
        >
          {{ $t('tool.globalReplace') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 选色弹窗：画笔/替色选中即回传，整体替换需要「源 → 目标」再确认。
// 目标色是弹窗内部状态（还没确认的草稿），其余全部来自页面。
import type { BeadColor } from '~/types'

const props = defineProps<{
  open: boolean
  mode: 'brush' | 'replace' | 'global'
  colors: BeadColor[]
  /** 整体替换的源色号 */
  sourceCode?: string | null
  /** 画笔/替色当前选中的色号 */
  brushCode?: string
}>()

const emit = defineEmits<{
  (e: 'pick', code: string): void
  (e: 'confirm-global', code: string): void
  (e: 'close'): void
}>()

const { t } = useI18n()

const target = ref('')

// 每次打开都清掉上次未确认的目标色
watch(
  () => props.open,
  (open) => {
    if (open) target.value = ''
  }
)

const title = computed(() => {
  if (props.mode === 'global') return `${t('tool.globalReplace')} ${props.sourceCode || ''}`.trim()
  if (props.mode === 'replace') return t('tool.replace')
  return t('tool.brushSelectColor')
})

const sourceHex = computed(() => props.colors.find(c => c.code === props.sourceCode)?.hex || '#FFFFFF')
const targetHex = computed(() => props.colors.find(c => c.code === target.value)?.hex || '')

function onPick(code: string) {
  // 整体替换只记录目标色，等点「确定」；画笔/替色选中即生效
  if (props.mode === 'global') {
    target.value = code
    return
  }
  emit('pick', code)
}
</script>
