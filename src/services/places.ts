import { apiUrl } from '../lib/api'

export type PlaceCategory = 'MT1' | 'SW8' | 'CS2' | 'HP8' | 'PM9' | 'CE7' | 'PK6'

export interface NearbyPlace {
  id: string
  name: string
  lat: number
  lng: number
  distance: number
  address: string
  category: PlaceCategory | 'CUSTOM'
  sourceId?: string // destination.id or candidate.id
}

export const PLACE_CATEGORIES: Record<PlaceCategory, { label: string; emoji: string; color: string; radius: number }> = {
  MT1: { label: '대형마트',  emoji: '🛒', color: '#f97316', radius: 2000 },
  SW8: { label: '지하철역',  emoji: '🚇', color: '#3b82f6', radius: 1000 },
  CS2: { label: '편의점',    emoji: '🏪', color: '#10b981', radius: 500  },
  HP8: { label: '병원',      emoji: '🏥', color: '#ef4444', radius: 1000 },
  PM9: { label: '약국',      emoji: '💊', color: '#8b5cf6', radius: 500  },
  CE7: { label: '카페',      emoji: '☕', color: '#a16207', radius: 500  },
  PK6: { label: '공원',      emoji: '🌳', color: '#16a34a', radius: 1500 },
}

const OVERPASS_TAGS: Record<PlaceCategory, string[]> = {
  MT1: ['["shop"="supermarket"]', '["shop"="wholesale"]'],
  SW8: ['["railway"="station"]["subway"="yes"]', '["railway"="station"]["station"="subway"]', '["railway"="station"]["network"~"Seoul|수도권"]'],
  CS2: ['["shop"="convenience"]'],
  HP8: ['["amenity"="hospital"]', '["amenity"="clinic"]'],
  PM9: ['["amenity"="pharmacy"]'],
  CE7: ['["amenity"="cafe"]'],
  PK6: ['["leisure"="park"]', '["leisure"="garden"]'],
}

const OVERPASS_URL = '/api/overpass'

// In-memory cache keyed by sorted location IDs + category
const overpassCache = new Map<string, NearbyPlace[]>()

function overpassCacheKey(locations: { id: string }[], category: PlaceCategory) {
  return `${[...locations].map((l) => l.id).sort().join(',')}:${category}`
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

interface OverpassElement {
  id: number
  type: 'node' | 'way'
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

// 여러 위치를 하나의 Overpass 쿼리로 합쳐 rate limit 방지
export async function fetchNearbyPlaces(
  locations: { lat: number; lng: number; id: string }[],
  category: PlaceCategory,
): Promise<NearbyPlace[]>
// 하위 호환: 단일 위치 (기존 시그니처)
export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  category: PlaceCategory,
  sourceId?: string,
): Promise<NearbyPlace[]>
export async function fetchNearbyPlaces(
  latOrLocations: number | { lat: number; lng: number; id: string }[],
  lngOrCategory: number | PlaceCategory,
  categoryArg?: PlaceCategory,
  sourceId?: string,
): Promise<NearbyPlace[]> {
  let locs: { lat: number; lng: number; id: string }[]
  let category: PlaceCategory

  if (Array.isArray(latOrLocations)) {
    locs = latOrLocations
    category = lngOrCategory as PlaceCategory
  } else {
    locs = [{ lat: latOrLocations as number, lng: lngOrCategory as number, id: sourceId ?? 'dest' }]
    category = categoryArg!
  }

  const cacheKey = overpassCacheKey(locs, category)
  if (overpassCache.has(cacheKey)) return overpassCache.get(cacheKey)!

  const { radius } = PLACE_CATEGORIES[category]
  const tags = OVERPASS_TAGS[category]

  const unions = locs
    .flatMap((loc) => {
      const around = `(around:${radius},${loc.lat},${loc.lng})`
      return tags.flatMap((t) => [`node${t}${around};`, `way${t}${around};`])
    })
    .join('\n')
  const query = `[out:json][timeout:25];\n(\n${unions}\n);\nout center;`

  // Overpass rate-limit 시 XML 에러를 반환하므로 재시도
  async function callOverpass(retries = 2): Promise<{ elements: OverpassElement[] } | null> {
    for (let i = 0; i <= retries; i++) {
      try {
        if (i > 0) await new Promise((r) => setTimeout(r, 1500 * i))
        const res = await fetch(OVERPASS_URL, { method: 'POST', body: query })
        if (!res.ok) continue
        const text = await res.text()
        if (!text.startsWith('{')) continue // XML 에러 응답
        return JSON.parse(text)
      } catch { continue }
    }
    return null
  }

  const data = await callOverpass()
  if (!data) return []

  const seenId = new Set<string>()
  const results: NearbyPlace[] = []

  for (const el of data.elements) {
    const uid = String(el.id)
    if (seenId.has(uid)) continue
    seenId.add(uid)

    const elLat = el.lat ?? el.center?.lat
    const elLng = el.lon ?? el.center?.lon
    const name = el.tags?.['name:ko'] ?? el.tags?.name
    if (!elLat || !elLng || !name) continue

    // 가장 가까운 위치 기준으로 distance / sourceId 결정
    let nearest = locs[0]
    let minDist = haversine(locs[0].lat, locs[0].lng, elLat, elLng)
    for (const loc of locs.slice(1)) {
      const d = haversine(loc.lat, loc.lng, elLat, elLng)
      if (d < minDist) { minDist = d; nearest = loc }
    }

    results.push({
      id: uid,
      name,
      lat: elLat,
      lng: elLng,
      distance: minDist,
      address: el.tags?.['addr:full'] ?? el.tags?.['addr:city'] ?? '',
      category,
      sourceId: nearest.id,
    })
  }

  // 위치(sourceId)별로 가까운 순 최대 10개씩 — 전역 컷이면 밀집 지역이 슬롯을 독식해
  // 다른 후보지 주변엔 하나도 안 남는 문제가 있었음
  const PER_LOCATION = 10
  const byRef = new Map<string, NearbyPlace[]>()
  for (const r of results.sort((a, b) => a.distance - b.distance)) {
    const bucket = byRef.get(r.sourceId) ?? []
    if (bucket.length < PER_LOCATION) {
      bucket.push(r)
      byRef.set(r.sourceId, bucket)
    }
  }
  const sorted = [...byRef.values()].flat().sort((a, b) => a.distance - b.distance)
  overpassCache.set(cacheKey, sorted)
  return sorted
}

export function clearOverpassCache() {
  overpassCache.clear()
}

// 키워드 검색: Naver Local Search → 목적지 근처 결과 필터
interface NaverLocalItem {
  title: string
  address: string
  roadAddress: string
  mapx: string
  mapy: string
}

export async function searchPlacesByKeyword(
  keyword: string,
  destLat: number,
  destLng: number,
  destName: string,
  maxDistance = 3000,
  sourceId?: string,
): Promise<NearbyPlace[]> {
  try {
    const params = new URLSearchParams({ query: `${destName} ${keyword}`, display: '20' })
    const res = await fetch(apiUrl(`/api/geocode?${params}`))
    if (!res.ok) return []
    const data: { items: NaverLocalItem[] } = await res.json()

    return (data.items ?? [])
      .map((item, i) => {
        const lng = parseInt(item.mapx) / 1e7
        const lat = parseInt(item.mapy) / 1e7
        if (!lat || !lng) return null
        const distance = haversine(destLat, destLng, lat, lng)
        if (distance > maxDistance) return null
        return {
          id: `custom-${sourceId ?? 'dest'}-${i}-${item.title}`,
          name: item.title.replace(/<[^>]+>/g, ''),
          lat,
          lng,
          distance,
          address: item.roadAddress || item.address,
          category: 'CUSTOM' as const,
          ...(sourceId ? { sourceId } : {}),
        }
      })
      .filter((p): p is NearbyPlace => p !== null)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10)
  } catch {
    return []
  }
}
