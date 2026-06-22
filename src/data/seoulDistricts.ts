import type { FeatureCollection, Feature } from 'geojson'

const GU_URL =
  'https://raw.githubusercontent.com/southkorea/seoul-maps/master/kostat/2013/json/seoul_municipalities_geo_simple.json'
const DONG_URL =
  'https://raw.githubusercontent.com/southkorea/seoul-maps/master/kostat/2013/json/seoul_submunicipalities_geo_simple.json'

let guCache: FeatureCollection | null = null
let dongCache: FeatureCollection | null = null

export async function fetchSeoulGeoJSON(): Promise<FeatureCollection> {
  if (guCache) return guCache
  const res = await fetch(GU_URL)
  if (!res.ok) throw new Error('Seoul 구 GeoJSON 로드 실패')
  guCache = await res.json()
  return guCache!
}

export async function fetchSeoulDongGeoJSON(): Promise<FeatureCollection> {
  if (dongCache) return dongCache
  const res = await fetch(DONG_URL)
  if (!res.ok) throw new Error('Seoul 동 GeoJSON 로드 실패')
  dongCache = await res.json()
  return dongCache!
}

export function getDistrictName(feature: Feature): string {
  const p = feature.properties ?? {}
  return p.name ?? p.SIG_KOR_NM ?? p.KOR_NM ?? p.adm_nm ?? '알 수 없음'
}

export function getDistrictCode(feature: Feature): string {
  return String(feature.properties?.code ?? '')
}

export function getDongName(feature: Feature): string {
  return feature.properties?.name ?? ''
}

// 동 features를 구 코드 prefix로 필터링
// 구 코드 예: "11230" (강남구), 동 코드 예: "1123080" (개포2동)
export function filterDongByGuCode(features: Feature[], guCode: string): Feature[] {
  return features.filter((f) => String(f.properties?.code ?? '').startsWith(guCode))
}

// 구 색상 — stride 배열로 인접 구가 같은 색 안 되게
const BLUE_SHADES = [
  '#a8d8f0', '#79c4e8', '#4aafe0', '#c9e8f8', '#93cff1',
  '#5fb8e7', '#2fa2df', '#b3dff5', '#6ec4ec', '#3baee4',
  '#d4edfb', '#9fd5f3', '#6abceb', '#38a8e3', '#c1e5f9',
  '#8acbee', '#57b2e6', '#25a0df', '#afddfa', '#7ac8ec',
  '#48b0e5', '#1a9bde', '#bce3f7', '#84c9ed', '#52b4e6',
]
const STRIDE = [0,4,9,14,19,2,7,12,17,22,3,8,13,18,23,1,6,11,16,21,24,5,10,15,20]

export function getDistrictColor(index: number): string {
  return BLUE_SHADES[STRIDE[index % STRIDE.length]]
}

// 동 색상 — 구보다 살짝 연한 파란 계열
const DONG_SHADES = [
  '#ddf0fb', '#cce9f8', '#bbe2f5', '#aadaf2', '#99d3ef',
  '#88ccec', '#77c4e9', '#66bde6', '#55b6e3', '#44aee0',
  '#eaf6fd', '#d3edfb', '#bcdeef', '#a5d5f0', '#8eccee',
]
const DONG_STRIDE = [0,4,9,1,6,11,2,7,12,3,8,13,5,10,14]

export function getDongColor(index: number): string {
  return DONG_SHADES[DONG_STRIDE[index % DONG_STRIDE.length]]
}
