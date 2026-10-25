<template>
  <header class="sticky top-0 z-30 border-b border-gray-100 bg-white/85 backdrop-blur">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
      <NuxtLink to="/tool/image-to-bead" class="flex items-center gap-2 shrink-0">
        <span class="w-7 h-7 rounded-md bg-indigo-500 text-white text-[11px] font-black flex items-center justify-center">BS</span>
        <span class="font-bold text-gray-900 tracking-tight">Bead Studio</span>
      </NuxtLink>

      <div class="flex items-center gap-3">
        <span class="hidden sm:inline text-xs text-gray-400">Runs 100% in your browser</span>
        <label class="sr-only" for="locale-switch">Language</label>
        <select
          id="locale-switch"
          :value="locale"
          class="px-2 py-1 rounded-md text-xs font-medium border border-gray-200 bg-gray-50 text-gray-600 outline-none cursor-pointer"
          @change="onLocaleChange"
        >
          <option v-for="l in localeOptions" :key="l.code" :value="l.code">{{ l.name }}</option>
        </select>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
const { locale, locales, setLocale } = useI18n()

const localeOptions = computed(() =>
  (locales.value as { code: string; name?: string }[]).map(l => ({ code: l.code, name: l.name || l.code }))
)

function onLocaleChange(e: Event) {
  const code = (e.target as HTMLSelectElement).value
  setLocale(code as 'en' | 'zh')
}
</script>
