export type PlaceCategory = 'MT1' | 'SW8' | 'CS2' | 'HP8' | 'PM9' | 'CE7' | 'PK6'

export interface NearbyPlace {
  id: string
  name: string
  lat: number
  lng: number
  distance: number
  address: string
  category: PlaceCategory | 'CUSTOM'
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

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

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

export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  category: PlaceCategory,
): Promise<NearbyPlace[]> {
  const { radius } = PLACE_CATEGORIES[category]
  const tags = OVERPASS_TAGS[category]
  const around = `(around:${radius},${lat},${lng})`

  const unions = tags.flatMap((t) => [`node${t}${around};`, `way${t}${around};`]).join('\n')
  const query = `[out:json][timeout:15];\n(\n${unions}\n);\nout center;`

  try {
    const res = await fetch(OVERPASS_URL, { method: 'POST', body: query })
    if (!res.ok) return []
    const data: { elements: OverpassElement[] } = await res.json()

    const seen = new Set<string>()
    const results: NearbyPlace[] = []

    for (const el of data.elements) {
      const elLat = el.lat ?? el.center?.lat
      const elLng = el.lon ?? el.center?.lon
      const name = el.tags?.['name:ko'] ?? el.tags?.name
      if (!elLat || !elLng || !name) continue
      if (seen.has(name)) continue
      seen.add(name)

      results.push({
        id: String(el.id),
        name,
        lat: elLat,
        lng: elLng,
        distance: haversine(lat, lng, elLat, elLng),
        address: el.tags?.['addr:full'] ?? el.tags?.['addr:city'] ?? '',
        category,
      })
    }

    return results.sort((a, b) => a.distance - b.distance).slice(0, 15)
  } catch {
    return []
  }
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
): Promise<NearbyPlace[]> {
  try {
    const params = new URLSearchParams({ query: `${destName} ${keyword}`, display: '20' })
    const res = await fetch(`/api/geocode?${params}`)
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
          id: `custom-${i}-${item.title}`,
          name: item.title.replace(/<[^>]+>/g, ''),
          lat,
          lng,
          distance,
          address: item.roadAddress || item.address,
          category: 'CUSTOM' as const,
        }
      })
      .filter((p): p is NearbyPlace => p !== null)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10)
  } catch {
    return []
  }
}
