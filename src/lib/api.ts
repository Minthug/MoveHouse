// dev: '' -> Vite proxy로 /api/... 처리
// production/AIT: Vercel URL -> https://xxx.vercel.app/api/...
const DEFAULT_API_BASE = import.meta.env.DEV ? '' : 'https://move-house.vercel.app'
const BASE = (import.meta.env.VITE_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, '')

export function apiUrl(path: string) {
  return `${BASE}${path}`
}
