<template>
  <div class="space-y-5">
    <!-- 与预设的差异 + 一键回到预设 -->
    <div class="flex items-center justify-between gap-2 text-[11px]">
      <span :class="diffCount ? 'text-amber-600 font-medium' : 'text-gray-400'">
        {{ diffCount ? $t('tool.advancedCustomized', { n: diffCount }) : $t('tool.advancedPreset') }}
      </span>
      <button
        v-if="diffCount"
        type="button"
        class="text-indigo-600 hover:text-indigo-800 hover:underline shrink-0"
        @click="resetToPreset"
      >{{ $t('tool.advancedReset') }}</button>
    </div>

    <!-- 采样与配色 -->
    <section class="space-y-2.5">
      <h4 class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{{ $t('tool.paramGroupSampling') }}</h4>

      <label class="flex items-center justify-between gap-2">
        <span class="text-xs text-gray-600">{{ $t('tool.paramSampling') }}</span>
        <select :value="params.sampling" class="param-select" @change="set('sampling', ($event.target as HTMLSelectElement).value as PatternParams['sampling'])">
          <option value="weighted">{{ $t('tool.samplingWeighted') }}</option>
          <option value="box">{{ $t('tool.samplingBox') }}</option>
          <option value="dominant">{{ $t('tool.samplingDominant') }}</option>
          <option value="median">{{ $t('tool.samplingMedian') }}</option>
        </select>
      </label>

      <label class="flex items-center justify-between gap-2">
        <span class="text-xs text-gray-600">{{ $t('tool.paramMatch') }}</span>
        <select :value="params.matchAlgorithm" class="param-select" @change="set('matchAlgorithm', ($event.target as HTMLSelectElement).value as PatternParams['matchAlgorithm'])">
          <option value="ciede2000">CIEDE2000</option>
          <option value="lab">Lab ΔE76</option>
          <option value="euclidean">RGB</option>
        </select>
      </label>

      <label class="flex items-center justify-between gap-2">
        <span class="text-xs text-gray-600">{{ $t('tool.paramCluster') }}</span>
        <select :value="params.algorithm" class="param-select" @change="set('algorithm', ($event.target as HTMLSelectElement).value as PatternParams['algorithm'])">
          <option value="lab">Lab ΔE76</option>
          <option value="euclidean">RGB</option>
          <option value="ciede2000">CIEDE2000</option>
        </select>
      </label>
    </section>

    <!-- 清理与合并 -->
    <section class="space-y-2.5">
      <h4 class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{{ $t('tool.paramGroupCleanup') }}</h4>

      <div v-for="s in cleanupSliders" :key="s.key" class="space-y-1">
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-600">{{ $t(s.labelKey) }}</span>
          <span class="font-mono text-gray-500">{{ display(s.key) }}</span>
        </div>
        <input
          type="range"
          :min="s.min"
          :max="s.max"
          :step="s.step"
          :value="params[s.key]"
          class="param-range"
          @input="set(s.key, Number(($event.target as HTMLInputElement).value))"
        />
      </div>
    </section>

    <!-- 抖动：只影响渐变，硬边不动 -->
    <section class="space-y-2.5">
      <div class="flex items-center justify-between">
        <h4 class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{{ $t('tool.paramGroupDither') }}</h4>
        <button
          type="button"
          class="text-[10px] px-1.5 py-0.5 rounded border transition-all"
          :class="params.dither > 0 ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-gray-50 text-gray-400 border-gray-200'"
          @click="set('dither', params.dither > 0 ? 0 : 0.6)"
        >{{ params.dither > 0 ? 'ON' : 'OFF' }}</button>
      </div>

      <template v-if="params.dither > 0">
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <span class="text-gray-600">{{ $t('tool.paramDitherStrength') }}</span>
            <span class="font-mono text-gray-500">{{ Math.round(params.dither * 100) }}%</span>
          </div>
          <input
            type="range" min="0.05" max="1" step="0.05"
            :value="params.dither"
            class="param-range"
            @input="set('dither', Number(($event.target as HTMLInputElement).value))"
          />
        </div>

        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <span class="text-gray-600">{{ $t('tool.paramDitherCap') }}</span>
            <span class="font-mono text-gray-500">{{ params.ditherCap === 0 ? $t('tool.paramUnlimited') : params.ditherCap }}</span>
          </div>
          <input
            type="range" min="0" max="32" step="1"
            :value="params.ditherCap"
            class="param-range"
            @input="set('ditherCap', Number(($event.target as HTMLInputElement).value))"
          />
        </div>

        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <span class="text-gray-600">{{ $t('tool.paramDitherGate') }}</span>
            <span class="font-mono text-gray-500">{{ params.ditherGate[0] }} – {{ params.ditherGate[1] }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <input
              type="range" min="0" max="20" step="0.5"
              :value="params.ditherGate[0]"
              class="param-range"
              @input="setGate(0, Number(($event.target as HTMLInputElement).value))"
            />
            <input
              type="range" min="10" max="45" step="1"
              :value="params.ditherGate[1]"
              class="param-range"
              @input="setGate(1, Number(($event.target as HTMLInputElement).value))"
            />
          </div>
        </div>
      </template>
    </section>

    <!-- 描边与细节：开关 -->
    <section class="space-y-2">
      <h4 class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{{ $t('tool.paramGroupEdge') }}</h4>
      <div class="grid grid-cols-2 gap-1.5">
        <button
          v-for="t in toggles"
          :key="t.key"
          type="button"
          class="px-2 py-1.5 rounded-md text-[11px] font-medium border text-center transition-all"
          :class="params[t.key] ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'"
          :title="$t(t.hintKey)"
          @click="set(t.key, !params[t.key])"
        >{{ $t(t.labelKey) }}</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
// 高级参数：把所有影响出图的旋钮摊开，默认值来自当前图纸风格预设。
// 组件不改内部状态：每次改动都 emit 一份新对象，页面统一持有（与其它设置一致）。
import {
  paramDiffCount,
  paramsFromStyle,
  type PatternParams
} from '~/utils/pattern-params'

const props = defineProps<{
  params: PatternParams
  /** 当前预设 key，用于算「改了几项」和重置 */
  presetKey: string
}>()

const emit = defineEmits<{
  (e: 'update:params', value: PatternParams): void
}>()

type NumericKey = 'denoiseLevel' | 'denoiseMaxDeltaE' | 'regionMergeDeltaE' | 'mergeDeltaE' | 'maxColors' | 'darkSpotCells'

const cleanupSliders: { key: NumericKey; labelKey: string; min: number; max: number; step: number }[] = [
  { key: 'denoiseLevel', labelKey: 'tool.paramDenoiseLevel', min: 0, max: 3, step: 1 },
  { key: 'denoiseMaxDeltaE', labelKey: 'tool.paramDenoiseMax', min: 4, max: 40, step: 1 },
  { key: 'regionMergeDeltaE', labelKey: 'tool.paramRegionMerge', min: 0, max: 16, step: 1 },
  { key: 'mergeDeltaE', labelKey: 'tool.paramMerge', min: 0, max: 32, step: 1 },
  { key: 'maxColors', labelKey: 'tool.paramMaxColors', min: 0, max: 64, step: 2 },
  { key: 'darkSpotCells', labelKey: 'tool.paramDarkSpot', min: 0, max: 8, step: 1 }
]

const toggles: { key: 'lineArt' | 'diagonalLine' | 'outlineRestore' | 'featureRestamp'; labelKey: string; hintKey: string }[] = [
  { key: 'lineArt', labelKey: 'tool.paramLineArt', hintKey: 'tool.paramLineArtHint' },
  { key: 'diagonalLine', labelKey: 'tool.paramDiagonal', hintKey: 'tool.paramDiagonalHint' },
  { key: 'outlineRestore', labelKey: 'tool.paramOutline', hintKey: 'tool.paramOutlineHint' },
  { key: 'featureRestamp', labelKey: 'tool.paramFeature', hintKey: 'tool.paramFeatureHint' }
]

const diffCount = computed(() => paramDiffCount(props.params, props.presetKey))

function set<K extends keyof PatternParams>(key: K, value: PatternParams[K]) {
  emit('update:params', { ...props.params, [key]: value })
}

function setGate(index: 0 | 1, value: number) {
  const gate: [number, number] = [...props.params.ditherGate] as [number, number]
  gate[index] = value
  // 下限不能压过上限，反之亦然（否则抖动整段失效且用户看不出原因）
  if (gate[0] >= gate[1]) {
    if (index === 0) gate[1] = gate[0] + 1
    else gate[0] = Math.max(0, gate[1] - 1)
  }
  set('ditherGate', gate)
}

function resetToPreset() {
  emit('update:params', paramsFromStyle(props.presetKey))
}

/** 滑块的数值展示：0 值在这些参数里表示「关闭」，直接写出来比 0 好懂 */
function display(key: NumericKey) {
  const v = props.params[key]
  if (v === 0) return key === 'denoiseLevel' ? '0' : 'OFF'
  return String(v)
}
</script>

<style scoped>
.param-select {
  padding: 3px 22px 3px 8px;
  font-size: 11px;
  line-height: 1.4;
  border: 1px solid var(--modern-border);
  border-radius: 6px;
  background-color: #f8fafc;
  color: #475569;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  max-width: 8.5rem;
}

.param-range {
  width: 100%;
  height: 4px;
  border-radius: 9999px;
  appearance: none;
  background: #e2e8f0;
  cursor: pointer;
  accent-color: #6366f1;
}
</style>
