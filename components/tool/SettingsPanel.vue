<template>
  <!-- 一张卡片分四段：基础 / 色板 / 图纸风格 / 高级参数。
       原来是一堆独立 card，加了高级参数后左栏太高——改成同卡分段 + 紧凑分段按钮，
       高级参数默认收起，展开后自身滚动，不再把整栏顶长。 -->
  <div class="modern-card divide-y divide-gray-100">
    <!-- 基础：纸张宽度 + 珠子规格 -->
    <section class="p-5 space-y-4">
      <div>
        <label class="block text-xs font-semibold text-gray-900 mb-2">{{ $t('tool.gridSize') }}</label>
        <div class="grid grid-cols-3 gap-1.5">
          <button
            v-for="size in gridSizes"
            :key="size.value"
            type="button"
            class="px-2 py-1.5 rounded-lg text-xs font-medium border transition-all"
            :class="selectedGridSize === size.value
              ? 'bg-indigo-500 text-white border-indigo-500'
              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'"
            @click="emit('update:selectedGridSize', size.value)"
          >{{ size.label }}</button>
        </div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-gray-900 mb-2">{{ $t('tool.beadSize') }}</label>
        <div class="grid grid-cols-2 gap-1.5">
          <button
            v-for="size in beadSizeOptions"
            :key="size"
            type="button"
            class="px-2 py-1.5 rounded-lg text-xs font-medium border transition-all"
            :class="beadSize === size
              ? 'bg-indigo-500 text-white border-indigo-500'
              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'"
            @click="emit('update:beadSize', size)"
          >{{ size }}</button>
        </div>
        <p v-if="physicalSizeCm" class="mt-2 text-[11px] text-gray-500">
          {{ $t('tool.finishedSize') }}：≈ {{ physicalSizeCm.w.toFixed(1) }} × {{ physicalSizeCm.h.toFixed(1) }} cm
        </p>
      </div>

      <div>
        <label class="block text-xs font-semibold text-gray-900 mb-2">{{ $t('tool.beadStyle') }}</label>
        <div class="grid grid-cols-3 gap-1.5">
          <button
            v-for="style in styleOptions"
            :key="style.key"
            type="button"
            class="px-1 py-1.5 rounded-lg text-[11px] font-medium border transition-all text-center"
            :class="selectedStyle === style.key
              ? 'bg-indigo-500 text-white border-indigo-500'
              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'"
            @click="emit('update:selectedStyle', style.key)"
          >
            <span class="mr-0.5">{{ style.icon }}</span>{{ $t(style.labelKey) }}
          </button>
        </div>
      </div>
    </section>

    <!-- 色板 -->
    <section class="p-5 space-y-2">
      <label class="block text-xs font-semibold text-gray-900">{{ $t('tool.palette') }}</label>
      <select
        :value="selectedPaletteId"
        class="modern-select"
        style="padding: 6px 10px; font-size: 13px;"
        @change="emit('update:selectedPaletteId', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="p in brandPalettes" :key="p.id" :value="p.id">{{ p.name }} ({{ p.brand }}) — {{ p.colors.length }} {{ $t('tool.colors') }}</option>
      </select>

      <div v-if="currentVariants.length > 0" class="flex items-center gap-2">
        <span class="text-[11px] text-gray-500 shrink-0">{{ currentBrandPalette?.brand }}</span>
        <select
          :value="selectedVariantId"
          class="modern-select"
          style="padding: 6px 10px; font-size: 13px;"
          @change="emit('update:selectedVariantId', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="v in currentVariants" :key="v.id" :value="v.id">{{ v.label }}</option>
        </select>
      </div>
    </section>

    <!-- 图纸风格 -->
    <section class="p-5 space-y-2">
      <label class="block text-xs font-semibold text-gray-900">{{ $t('tool.patternStyle') }}</label>
      <div class="grid grid-cols-2 gap-1.5">
        <button
          v-for="style in patternStyleOptions"
          :key="style.key"
          type="button"
          class="px-2 py-2 rounded-lg text-xs font-medium border transition-all text-center"
          :class="selectedPatternStyle === style.key
            ? 'bg-indigo-500 text-white border-indigo-500'
            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'"
          @click="emit('update:selectedPatternStyle', style.key)"
        >
          <span class="mr-1">{{ style.icon }}</span>{{ $t(style.labelKey) }}
        </button>
      </div>
      <p class="text-[11px] text-gray-500 leading-relaxed">{{ $t('tool.patternStyleHint') }}</p>
    </section>

    <!-- 高级参数（默认收起） -->
    <section class="p-5">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 text-left"
        :aria-expanded="advancedOpen"
        @click="advancedOpen = !advancedOpen"
      >
        <span class="flex items-center gap-2">
          <span class="text-xs font-semibold text-gray-900">{{ $t('tool.advanced') }}</span>
          <span
            v-if="customizedCount > 0"
            class="px-1.5 py-0.5 rounded-full bg-amber-100 text-[10px] font-medium text-amber-700"
          >{{ $t('tool.advancedBadge', { n: customizedCount }) }}</span>
        </span>
        <svg
          class="w-4 h-4 text-gray-400 transition-transform"
          :class="{ 'rotate-180': advancedOpen }"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        ><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
      </button>

      <div v-if="advancedOpen" ref="advancedEl" class="mt-3">
        <AdvancedSettings
          :params="patternParams"
          :preset-key="selectedPatternStyle"
          @update:params="emit('update:patternParams', $event)"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { BeadStyle } from '~/utils/bead-algorithm'
import { paramDiffCount, type PatternParams } from '~/utils/pattern-params'

type BeadSize = '5MM' | '2.6MM'

const props = withDefaults(defineProps<{
  gridSizes: { value: string; label: string }[]
  selectedGridSize: string
  beadSizeOptions: readonly BeadSize[]
  beadSize: BeadSize
  physicalSizeCm: { w: number; h: number } | null
  brandPalettes: { id: string; name: string; brand: string; colors: unknown[] }[]
  selectedPaletteId: string
  currentVariants: { id: string; label: string }[]
  selectedVariantId: string
  currentBrandPalette: { brand: string } | null
  styleOptions: { key: BeadStyle; icon: string; labelKey: string }[]
  selectedStyle: BeadStyle
  patternStyleOptions: { key: string; icon: string; labelKey: string }[]
  selectedPatternStyle: string
  patternParams: PatternParams
  /** 高级参数默认是否展开（移动端建议收起） */
  defaultAdvancedOpen?: boolean
}>(), {
  defaultAdvancedOpen: false
})

const emit = defineEmits<{
  (e: 'update:selectedGridSize', v: string): void
  (e: 'update:beadSize', v: BeadSize): void
  (e: 'update:selectedPaletteId', v: string): void
  (e: 'update:selectedVariantId', v: string): void
  (e: 'update:selectedStyle', v: BeadStyle): void
  (e: 'update:selectedPatternStyle', v: string): void
  (e: 'update:patternParams', v: PatternParams): void
}>()

const advancedOpen = ref(props.defaultAdvancedOpen)
const customizedCount = computed(() => paramDiffCount(props.patternParams, props.selectedPatternStyle))

// 展开后把面板滚进视野：左栏在大屏上是独立滚动容器（sticky + max-h），
// 不主动滚一下的话，展开的只是页尾那一行标题，用户会以为没反应。
const advancedEl = ref<HTMLElement | null>(null)
watch(advancedOpen, (open) => {
  if (!open) return
  nextTick(() => advancedEl.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
})
</script>
