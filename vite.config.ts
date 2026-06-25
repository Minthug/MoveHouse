import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api/transit': {
          target: 'https://api.odsay.com',
          changeOrigin: true,
          rewrite: (path) => {
            const base = path.replace(/^\/api\/transit/, '/v1/api/searchPubTransPathT')
            const sep = base.includes('?') ? '&' : '?'
            return `${base}${sep}apiKey=${encodeURIComponent(env.ODSAY_API_KEY ?? '')}`
          },
          headers: {
            Referer: 'http://localhost:5173',
          },
        },
        '/api/geocode': {
          target: 'https://openapi.naver.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/geocode/, '/v1/search/local.json'),
          headers: {
            'X-Naver-Client-Id': env.NAVER_DEV_CLIENT_ID ?? '',
            'X-Naver-Client-Secret': env.NAVER_DEV_CLIENT_SECRET ?? '',
          },
        },
        '/api/directions': {
          target: 'https://naveropenapi.apigw.ntruss.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/directions/, '/map-direction/v1/driving'),
          headers: {
            'X-NCP-APIGW-API-KEY-ID': env.NAVER_CLIENT_ID ?? '',
            'X-NCP-APIGW-API-KEY': env.NAVER_CLIENT_SECRET ?? '',
          },
        },
        '/api/juso-coord': {
          target: 'https://business.juso.go.kr',
          changeOrigin: true,
          rewrite: (path) => {
            const base = path.replace(/^\/api\/juso-coord/, '/addrlink/addrCoordApi.do')
            const sep = base.includes('?') ? '&' : '?'
            return `${base}${sep}confmKey=${env.JUSO_COORD_KEY ?? ''}&resultType=json`
          },
        },
        '/api/juso': {
          target: 'https://business.juso.go.kr',
          changeOrigin: true,
          rewrite: (path) => {
            const base = path.replace(/^\/api\/juso/, '/addrlink/addrLinkApi.do')
            const sep = base.includes('?') ? '&' : '?'
            return `${base}${sep}confmKey=${env.JUSO_API_KEY ?? ''}&resultType=json`
          },
        },
      },
    },
  }
})
