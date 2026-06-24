export type PlaceCategory = 'MT1' | 'SW8'

export interface NearbyPlace {
  id: string
  name: string
  lat: number
  lng: number
  distance: number
  address: string
  category: PlaceCategory
}

export const PLACE_CATEGORIES: Record<PlaceCategory, { label: string; emoji: string; color: string; radius: number }> = {
  MT1: { label: '대형마트', emoji: '🛒', color: '#f97316', radius: 2000 },
  SW8: { label: '지하철역', emoji: '🚇', color: '#3b82f6', radius: 1000 },
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

function buildQuery(lat: number, lng: number, category: PlaceCategory): string {
  const { radius } = PLACE_CATEGORIES[category]
  const around = `(around:${radius},${lat},${lng})`

  if (category === 'MT1') {
    return `[out:json][timeout:15];
(
  node["shop"="supermarket"]${around};
  way["shop"="supermarket"]${around};
  node["shop"="wholesale"]${around};
  way["shop"="wholesale"]${around};
);
out center;`
  }

  // SW8: 지하철역
  return `[out:json][timeout:15];
(
  node["railway"="station"]["subway"="yes"]${around};
  node["railway"="station"]["station"="subway"]${around};
  node["railway"="station"]["network"~"Seoul|수도권"]${around};
);
out center;`
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

export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  category: PlaceCategory,
): Promise<NearbyPlace[]> {
  try {
    const query = buildQuery(lat, lng, category)
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: query,
    })
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
