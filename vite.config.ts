import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

export default defineConfig({
  server: {
    // 与 README 保持一致：http://localhost:3000
    port: 3000,
  },
  plugins: [
    vue(),
    // 与 Nuxt 时代保持一致的 DX：vue API 与 composables/ 下的组合式函数免导入，
    // components/ 下的组件免注册（生成 auto-imports.d.ts / components.d.ts 供类型检查）。
    AutoImport({
      imports: ['vue', 'vue-i18n'],
      dirs: ['composables'],
      dts: 'auto-imports.d.ts',
      vueTemplate: false,
    }),
    Components({
      dirs: ['components'],
      dts: 'components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('.', import.meta.url)),
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
