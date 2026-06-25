// dev: '' → Vite proxy로 /api/... 처리
// production: Vercel URL → https://xxx.vercel.app/api/...
const BASE = import.meta.env.VITE_API_BASE ?? ''

export function apiUrl(path: string) {
  return `${BASE}${path}`
}
