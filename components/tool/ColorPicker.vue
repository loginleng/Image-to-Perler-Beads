<template>
  <div class="space-y-2">
    <!-- 搜索：色号 / 名称 -->
    <div class="flex items-center gap-2">
      <div class="relative flex-1">
        <input
          v-model="keyword"
          type="text"
          :placeholder="$t('tool.colorSearch')"
          class="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-700 outline-none focus:border-indigo-400 focus:bg-white"
        />
        <button
          v-if="keyword"
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
          @click="keyword = ''"
        >×</button>
      </div>
      <span class="text-[11px] text-gray-400 shrink-0">{{ filteredColors.length }} {{ $t('tool.colors') }}</span>
    </div>

    <!-- 色号前缀筛选：色多时先按 A / B / H… 收窄 -->
    <div v-if="prefixList.length > 1" class="flex flex-wrap gap-1">
      <button
        v-for="p in prefixList"
        :key="p"
        type="button"
        class="px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors"
        :class="activePrefix === p
          ? 'bg-indigo-500 text-white border-indigo-500'
          : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'"
        @click="activePrefix = p"
      >{{ p }}</button>
    </div>

    <!-- 最近使用 -->
    <div v-if="recentColors.length" class="flex items-center gap-2">
      <span class="text-[11px] text-gray-400 shrink-0">{{ $t('tool.recentColors') }}</span>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="c in recentColors"
          :key="`recent-${c.code}`"
          type="button"
          class="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 hover:border-indigo-300"
          :title="`${c.name} (${c.code})`"
          @click="pick(c.code)"
        >
          <span class="w-3 h-3 rounded-sm border border-black/10" :style="{ backgroundColor: c.hex }"></span>
          <span class="text-[10px] font-mono text-gray-600">{{ c.code }}</span>
        </button>
      </div>
    </div>

    <!-- 色块网格：色块 + 色号 + 名称 -->
    <div class="overflow-y-auto pr-1" :style="{ maxHeight }">
      <div class="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-10 gap-1.5">
        <button
          v-for="c in filteredColors"
          :key="c.code"
          type="button"
          class="flex flex-col items-center gap-0.5 p-1 rounded-md hover:bg-gray-50 transition-colors"
          :title="`${c.name} (${c.code})`"
          @click="pick(c.code)"
        >
          <span
            class="w-6 h-6 rounded-md border border-black/10"
            :class="selected === c.code ? 'ring-2 ring-indigo-500 ring-offset-1' : ''"
            :style="{ backgroundColor: c.hex }"
          ></span>
          <span class="w-full truncate text-center text-[9px] font-mono leading-tight text-gray-600">{{ c.code }}</span>
          <span
            v-if="c.name && c.name !== c.code"
            class="w-full truncate text-center text-[9px] leading-tight text-gray-400"
          >{{ c.name }}</span>
        </button>
      </div>
      <p v-if="!filteredColors.length" class="py-6 text-center text-xs text-gray-400">
        {{ colors.length ? $t('tool.colorNoMatch') : $t('tool.paletteEmpty') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BeadColor } from '~/types'

/*
 * 统一选色器（PC 版）：画笔、单格替色、颜色统计整体替换共用。
 *
 * 大色板的三层收敛：
 *   1) 搜索：色号 / 名称；
 *   2) 前缀筛选：没有 series 字段，按色号首字母分组（A / B / H / P…）；
 *   3) 最近使用：跨面板共享。
 * 每个色块下方显示色号，有名称时再显示一行名称。
 */
const props = withDefaults(
  defineProps<{
    colors: BeadColor[]
    selected?: string | null
    maxHeight?: string
  }>(),
  {
    selected: null,
    maxHeight: '240px'
  }
)

const emit = defineEmits<{
  (e: 'select', code: string): void
}>()

const ALL = '全部'
const keyword = ref('')
const activePrefix = ref(ALL)

// 模块级最近使用：同一页面里的画笔 / 替色 / 整体替换共享
const recentCodes = ref<string[]>([])

function prefixOf(code: string) {
  const match = /^[A-Za-z]+/.exec(code || '')
  return match ? match[0].toUpperCase() : '#'
}

const prefixList = computed(() => {
  const set = new Set<string>()
  for (const c of props.colors || []) set.add(prefixOf(c.code))
  const list = Array.from(set).sort((a, b) => a.localeCompare(b))
  return list.length > 1 ? [ALL, ...list] : []
})

const filteredColors = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  return (props.colors || []).filter((c) => {
    if (activePrefix.value !== ALL && prefixOf(c.code) !== activePrefix.value) return false
    if (!text) return true
    return String(c.code).toLowerCase().includes(text) || String(c.name).toLowerCase().includes(text)
  })
})

const recentColors = computed(() => {
  const map = new Map((props.colors || []).map((c) => [c.code, c]))
  return recentCodes.value.map((code) => map.get(code)).filter((c): c is BeadColor => Boolean(c))
})

// 换色板后清掉已不存在的最近色
watch(
  () => props.colors,
  (colors) => {
    const valid = new Set((colors || []).map((c) => c.code))
    recentCodes.value = recentCodes.value.filter((code) => valid.has(code))
  }
)

function pick(code: string) {
  emit('select', code)
  recentCodes.value = [code, ...recentCodes.value.filter((c) => c !== code)].slice(0, 8)
}
</script>
