<template>
  <div class="space-y-6">
    <!-- Paper Size -->
    <div class="modern-card p-6">
      <label class="block text-sm font-semibold text-gray-900 mb-3">{{ $t('tool.gridSize') }}</label>
      <select :value="selectedGridSize" @change="emit('update:selectedGridSize', ($event.target as HTMLSelectElement).value)" class="modern-select">
        <option v-for="size in gridSizes" :key="size.value" :value="size.value">{{ size.label }}</option>
      </select>
    </div>

    <!-- Bead Size -->
    <div class="modern-card p-6">
      <label class="block text-sm font-semibold text-gray-900 mb-3">{{ $t('tool.beadSize') }}</label>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="size in beadSizeOptions"
          :key="size"
          type="button"
          @click="emit('update:beadSize', size)"
          :class="[
            'px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-center',
            beadSize === size
              ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
          ]"
        >{{ size }}</button>
      </div>
      <p v-if="physicalSizeCm" class="mt-3 text-xs text-gray-500">
        {{ $t('tool.finishedSize') }}：≈ {{ physicalSizeCm.w.toFixed(1) }} × {{ physicalSizeCm.h.toFixed(1) }} cm
      </p>
    </div>

    <!-- Color Palette -->
    <div class="modern-card p-6">
      <label class="block text-sm font-semibold text-gray-900 mb-3">{{ $t('tool.palette') }}</label>
      <select :value="selectedPaletteId" @change="emit('update:selectedPaletteId', ($event.target as HTMLSelectElement).value)" class="modern-select">
        <option v-for="p in brandPalettes" :key="p.id" :value="p.id">{{ p.name }} ({{ p.brand }}) — {{ p.colors.length }} {{ $t('tool.colors') }}</option>
      </select>

      <div v-if="currentVariants.length > 0" class="mt-4">
        <label class="block text-sm font-semibold text-gray-900 mb-3">{{ currentBrandPalette?.brand }}</label>
        <select :value="selectedVariantId" @change="emit('update:selectedVariantId', ($event.target as HTMLSelectElement).value)" class="modern-select">
          <option v-for="v in currentVariants" :key="v.id" :value="v.id">{{ v.label }}</option>
        </select>
      </div>
    </div>

    <!-- Bead Style -->
    <div class="modern-card p-6">
      <label class="block text-sm font-semibold text-gray-900 mb-3">{{ $t('tool.beadStyle') }}</label>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="style in styleOptions"
          :key="style.key"
          @click="emit('update:selectedStyle', style.key)"
          :class="[
            'px-3 py-3 rounded-lg text-sm font-medium transition-all text-center',
            selectedStyle === style.key
              ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
          ]"
        >
          <div class="text-lg mb-1">{{ style.icon }}</div>
          <div class="text-xs">{{ $t(style.labelKey) }}</div>
        </button>
      </div>
    </div>

    <!-- Pattern Style（图纸风格：决定降采样方式与降噪强度） -->
    <div class="modern-card p-6">
      <label class="block text-sm font-semibold text-gray-900 mb-3">{{ $t('tool.patternStyle') }}</label>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="style in patternStyleOptions"
          :key="style.key"
          type="button"
          @click="emit('update:selectedPatternStyle', style.key)"
          :class="[
            'px-3 py-3 rounded-lg text-sm font-medium transition-all text-center',
            selectedPatternStyle === style.key
              ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
          ]"
        >
          <div class="text-lg mb-1">{{ style.icon }}</div>
          <div class="text-xs">{{ $t(style.labelKey) }}</div>
        </button>
      </div>
      <p class="mt-3 text-xs text-gray-500 leading-relaxed">{{ $t('tool.patternStyleHint') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BeadStyle } from '~/utils/bead-algorithm'

type BeadSize = '5MM' | '2.6MM'

defineProps<{
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
}>()

const emit = defineEmits<{
  (e: 'update:selectedGridSize', v: string): void
  (e: 'update:beadSize', v: BeadSize): void
  (e: 'update:selectedPaletteId', v: string): void
  (e: 'update:selectedVariantId', v: string): void
  (e: 'update:selectedStyle', v: BeadStyle): void
  (e: 'update:selectedPatternStyle', v: string): void
}>()
</script>
