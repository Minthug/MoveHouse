import type { CandidateLocation, Destination } from '../types'

type DestType = Destination['type']

// 디코드 후 앱에서 쓰는 친화적 형태
export interface ShareData {
  name?: string
  dest: { lat: number; lng: number; name: string; type: DestType }
  dest2?: { lat: number; lng: number; name: string; type: DestType }
  cands: Array<{ lat: number; lng: number; name: string; rent?: number; memo?: string }>
}

// 인코딩되는 압축 형태 (배열 + 짧은 키). 경로는 넣지 않고 열 때 재계산.
interface Packed {
  n?: string
  d: [number, number, string, DestType]
  e?: [number, number, string, DestType]
  c: Array<[number, number, string, number, string]> // lat,lng,name,rent,memo
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6

// UTF-8 안전 base64url (한글도 3바이트→4자, URL에서 +/= 로 인한 깨짐 없음)
function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64decode(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeShare(
  destination: Destination,
  candidates: CandidateLocation[],
  destination2?: Destination | null,
  boardName?: string,
): string {
  const packed: Packed = {
    n: boardName || undefined,
    d: [r6(destination.lat), r6(destination.lng), destination.name, destination.type],
    e: destination2 ? [r6(destination2.lat), r6(destination2.lng), destination2.name, destination2.type] : undefined,
    c: candidates.map((c) => [r6(c.lat), r6(c.lng), c.name, c.rent ?? 0, c.memo ?? '']),
  }
  const b64 = b64encode(JSON.stringify(packed))
  const url = new URL(window.location.href)
  url.searchParams.delete('share')
  url.searchParams.set('s', b64)
  return url.toString()
}

export function decodeShare(): ShareData | null {
  try {
    const b64 = new URLSearchParams(window.location.search).get('s')
    if (!b64) return null
    const p = JSON.parse(b64decode(b64)) as Packed
    return {
      name: p.n,
      dest: { lat: p.d[0], lng: p.d[1], name: p.d[2], type: p.d[3] },
      dest2: p.e ? { lat: p.e[0], lng: p.e[1], name: p.e[2], type: p.e[3] } : undefined,
      cands: p.c.map((c) => ({ lat: c[0], lng: c[1], name: c[2], rent: c[3] || undefined, memo: c[4] || undefined })),
    }
  } catch {
    return null
  }
}
