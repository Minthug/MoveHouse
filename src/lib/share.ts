import type { CandidateLocation, Destination } from '../types'

interface ShareData {
  dest: Pick<Destination, 'lat' | 'lng' | 'name' | 'type'>
  cands: Array<Pick<CandidateLocation, 'lat' | 'lng' | 'name' | 'label' | 'routes' | 'memo'>>
}

export function encodeShare(destination: Destination, candidates: CandidateLocation[]): string {
  const data: ShareData = {
    dest: { lat: destination.lat, lng: destination.lng, name: destination.name, type: destination.type },
    cands: candidates.map((c) => ({
      lat: c.lat, lng: c.lng, name: c.name, label: c.label, routes: c.routes, memo: c.memo,
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
