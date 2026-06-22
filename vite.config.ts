import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api/directions': {
          target: 'https://naveropenapi.apigw.ntruss.com',
          changeOrigin: true,
          rewrite: (path) =>
            path.replace(/^\/api\/directions/, '/map-direction/v1/driving'),
          headers: {
            'X-NCP-APIGW-API-KEY-ID': env.NAVER_CLIENT_ID ?? '',
            'X-NCP-APIGW-API-KEY': env.NAVER_CLIENT_SECRET ?? '',
          },
        },
      },
    },
  }
})
