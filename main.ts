import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import en from './i18n/locales/en.json'
import zh from './i18n/locales/zh.json'
import './assets/css/main.css'

// 语言跟随浏览器，且不做任何持久化（无 cookie / 无 localStorage）——刷新即重置
const locale = navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'

const i18n = createI18n({
  legacy: false,
  globalInjection: true, // 模板里可以直接用 $t
  locale,
  fallbackLocale: 'en',
  messages: { en, zh },
})

createApp(App).use(i18n).mount('#app')
