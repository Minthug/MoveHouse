import { defineConfig } from '@apps-in-toss/web-framework/config'

export default defineConfig({
  appName: 'commute-compare',
  brand: {
    displayName: '이사 통근 비교',
    primaryColor: '#3B82F6',
    icon: '/app-icon.svg',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite',
      build: 'vite build',
    },
  },
  permissions: [],
  outdir: 'dist',
})
