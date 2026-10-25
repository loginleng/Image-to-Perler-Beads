<template>
  <!-- Color Stats Table（固定高度约 6 行，超出滚动） -->
  <div class="overflow-x-auto">
    <div class="max-h-[330px] overflow-y-auto">
      <table class="modern-table">
        <thead>
          <tr>
            <th class="w-10 sticky top-0 z-10"></th>
            <th class="sticky top-0 z-10">{{ $t('tool.colorName') }}</th>
            <th class="sticky top-0 z-10">{{ $t('tool.code') }}</th>
            <th class="text-right sticky top-0 z-10">{{ $t('tool.totalBeads') }}</th>
            <th class="text-right sticky top-0 z-10">%</th>
            <th class="text-right sticky top-0 z-10">{{ $t('tool.globalReplace') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="stat in stats"
            :key="stat.colorCode"
            :class="selectedColorCode === stat.colorCode ? '!bg-indigo-50' : ''"
          >
            <td>
              <span class="w-5 h-5 rounded block border border-gray-200" :style="{ backgroundColor: stat.hex }"></span>
            </td>
            <td class="font-medium">{{ stat.name }}</td>
            <td class="text-gray-500 font-mono text-xs">{{ stat.colorCode }}</td>
            <td class="text-right font-mono">{{ stat.count }}</td>
            <td class="text-right text-gray-500">{{ ((stat.count / totalBeads) * 100).toFixed(1) }}%</td>
            <td class="text-right">
              <button
                type="button"
                class="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                @click="$emit('replace', stat)"
              >{{ $t('tool.globalReplace') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  stats: { colorCode: string; name: string; hex: string; count: number }[]
  totalBeads: number
  selectedColorCode: string | null
}>()

defineEmits<{
  /** 点某一行的「整体替换」：把色号带回父级，展示选色板 */
  (e: 'replace', stat: { colorCode: string; name: string; hex: string; count: number }): void
}>()
</script>
