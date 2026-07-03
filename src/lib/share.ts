import type { CandidateLocation, Destination } from '../types'

interface ShareData {
  dest: Pick<Destination, 'lat' | 'lng' | 'name' | 'type'>
  dest2?: Pick<Destination, 'lat' | 'lng' | 'name' | 'type'>
  cands: Array<Pick<CandidateLocation, 'lat' | 'lng' | 'name' | 'label' | 'routes' | 'routes2' | 'memo'>>
}

export function encodeShare(destination: Destination, candidates: CandidateLocation[], destination2?: Destination | null): string {
  const data: ShareData = {
    dest: { lat: destination.lat, lng: destination.lng, name: destination.name, type: destination.type },
    dest2: destination2 ? { lat: destination2.lat, lng: destination2.lng, name: destination2.name, type: destination2.type } : undefined,
    cands: candidates.map((c) => ({
      lat: c.lat, lng: c.lng, name: c.name, label: c.label, routes: c.routes, routes2: c.routes2, memo: c.memo,
    })),
  }
  const b64 = btoa(encodeURIComponent(JSON.stringify(data)))
  const url = new URL(window.location.href)
  url.searchParams.set('share', b64)
  return url.toString()
}

export function decodeShare(): ShareData | null {
  try {
    const b64 = new URLSearchParams(window.location.search).get('share')
    if (!b64) return null
    return JSON.parse(decodeURIComponent(atob(b64))) as ShareData
  } catch {
    return null
  }
}
