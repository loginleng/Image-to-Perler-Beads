<template>
  <div class="grid grid-cols-10 sm:grid-cols-12 gap-1.5 overflow-y-auto pt-2" :style="{ maxHeight: maxHeight }">
    <button
      v-for="color in colors"
      :key="color.code"
      type="button"
      :disabled="disabledCodes.includes(color.code)"
      :title="`${color.name} (${color.code})`"
      :class="[
        'w-7 h-7 rounded-lg mx-auto cursor-pointer hover:scale-110 transition-transform border',
        selected === color.code ? 'ring-2 ring-indigo-500 ring-offset-1' : 'border-gray-200',
        disabledCodes.includes(color.code) ? 'opacity-30 cursor-not-allowed' : ''
      ]"
      :style="{ backgroundColor: color.hex }"
      @click="emit('select', color.code)"
    />
  </div>
</template>

<script setup lang="ts">
import type { BeadColor } from '~/types'

const props = withDefaults(defineProps<{
  colors: BeadColor[]
  selected?: string | null
  disabledCodes?: string[]
  maxHeight?: string
}>(), {
  selected: null,
  disabledCodes: () => [],
  maxHeight: '',
})

const emit = defineEmits<{
  (e: 'select', code: string): void
}>()
</script>
