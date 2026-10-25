// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: process.env.NODE_ENV !== 'production' },

  app: {
    head: {
      title: 'Bead Studio',
      meta: [
        { name: 'description', content: 'Turn any image into a bead / perler pattern in your browser. Free, no login, no upload.' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
      ],
      link: [
        // 字体已自托管（public/fonts/，@font-face 见 assets/css/main.css），
        // 不依赖任何第三方 CDN：无第三方请求、无 GDPR 风险、国内可访问。
        { rel: 'preload', href: '/fonts/inter-latin.woff2', as: 'font', type: 'font/woff2', crossorigin: '' },
        { rel: 'preload', href: '/fonts/press-start-2p-latin.woff2', as: 'font', type: 'font/woff2', crossorigin: '' },
      ],
    },
  },

  modules: [
    '@nuxtjs/tailwindcss',
    '@nuxtjs/i18n',
    // 修复 @nuxtjs/tailwindcss v6 与 tailwind v3 的兼容性问题：
    // 模块生成的 tailwind/postcss.mjs（ESM 格式，import .ts 配置 + import.meta）
    // 无法被 tailwind v3 的 require()/jiti 加载，导致 tailwind 配置解析为空、
    // 工具类完全不生成（页面样式缺失、CSS 产物仅几 KB）。
    // 内联模块在 modules:done 阶段把配置修正为指向项目自己的 tailwind.config.ts。
    (_, nuxt) => {
      nuxt.hook('modules:done', () => {
        const plugins = (nuxt.options.postcss as { plugins?: Record<string, unknown> })?.plugins
        if (plugins) {
          plugins['tailwindcss'] = { config: './tailwind.config.ts' }
          plugins['tailwindcss/nesting'] = {}
        }
      })
    },
  ],

  components: [{ path: '~/components/tool', prefix: '' }, '~/components'],

  css: ['~/assets/css/main.css'],

  tailwindcss: {
    cssPath: '~/assets/css/main.css',
  },

  i18n: {
    // 只保留工具页实际用到的两种语言：en / zh。
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'zh', name: '中文', file: 'zh.json' },
    ],
    defaultLocale: 'en',
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_lang',
      redirectOn: 'root',
      alwaysRedirect: true,
      fallbackLocale: 'en',
    },
    bundle: { optimizeTranslationDirective: false },
  },

  vite: {
    resolve: {
      alias: {
        // 修复 dev 模式报错 "Failed to resolve import #app-manifest"（见 Nuxt issue）。
        '#app-manifest': 'mocked-exports/empty',
      },
    },
  },

  nitro: {
    // 构建时为 _nuxt 静态资源预生成 .br/.gz，传输体积约降 70%
    compressPublicAssets: true,
  },

  routeRules: {
    // 打开首页直接进编辑器：本项目只有一个工具页，不需要落地页
    '/': { redirect: '/tool/image-to-bead' },
    '/fonts/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    // 工具页纯客户端计算，SSR 输出与语言无关（读取语言 cookie 除外），可安全整页 SWR。
    '/tool/image-to-bead': { cache: { swr: true, maxAge: 3600, varies: ['cookie', 'accept-language'] } },
  },

  typescript: {
    strict: true,
  },
})
