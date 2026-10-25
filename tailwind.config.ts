import type { Config } from 'tailwindcss'

export default {
  content: [
    './components/**/*.{vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './app.vue',
  ],
  theme: {
    extend: {
      colors: {
        bead: {
          primary: '#6366f1',
          secondary: '#8b5cf6',
          accent: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
} satisfies Config