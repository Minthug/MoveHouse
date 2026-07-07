import type { CandidateLocation, Destination } from '../types'
import { apiUrl } from './api'

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

// UTF-8 안전 base64url
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

function buildPacked(
  destination: Destination,
  candidates: CandidateLocation[],
  destination2?: Destination | null,
  boardName?: string,
): Packed {
  return {
    n: boardName || undefined,
    d: [r6(destination.lat), r6(destination.lng), destination.name, destination.type],
    e: destination2 ? [r6(destination2.lat), r6(destination2.lng), destination2.name, destination2.type] : undefined,
    c: candidates.map((c) => [r6(c.lat), r6(c.lng), c.name, c.rent ?? 0, c.memo ?? '']),
  }
}

function unpack(p: Packed): ShareData {
  return {
    name: p.n,
    dest: { lat: p.d[0], lng: p.d[1], name: p.d[2], type: p.d[3] },
    dest2: p.e ? { lat: p.e[0], lng: p.e[1], name: p.e[2], type: p.e[3] } : undefined,
    cands: p.c.map((c) => ({ lat: c[0], lng: c[1], name: c[2], rent: c[3] || undefined, memo: c[4] || undefined })),
  }
}

// 인라인 링크 (?s=base64) — 서버 단축이 실패할 때의 폴백
export function encodeShare(
  destination: Destination,
  candidates: CandidateLocation[],
  destination2?: Destination | null,
  boardName?: string,
): string {
  const b64 = b64encode(JSON.stringify(buildPacked(destination, candidates, destination2, boardName)))
  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set('s', b64)
  return url.toString()
}

// 서버 단축 링크 (?id=xxxx). 실패 시 인라인 링크로 폴백.
export async function createShareUrl(
  destination: Destination,
  candidates: CandidateLocation[],
  destination2?: Destination | null,
  boardName?: string,
): Promise<string> {
  const packed = buildPacked(destination, candidates, destination2, boardName)
  try {
    const res = await fetch(apiUrl('/api/share'), { method: 'POST', body: JSON.stringify(packed) })
    if (res.ok) {
      const { id } = (await res.json()) as { id?: string }
      if (id) {
        const url = new URL(window.location.href)
        url.search = ''
        url.searchParams.set('id', id)
        return url.toString()
      }
    }
  } catch {
    // 폴백
  }
  return encodeShare(destination, candidates, destination2, boardName)
}

// 인라인 ?s= 즉시 디코드 (동기)
export function decodeShare(): ShareData | null {
  try {
    const b64 = new URLSearchParams(window.location.search).get('s')
    if (!b64) return null
    return unpack(JSON.parse(b64decode(b64)) as Packed)
  } catch {
    return null
  }
}

// 단축 링크 id (?id=) 있으면 반환
export function getShareId(): string | null {
  const id = new URLSearchParams(window.location.search).get('id')
  return id && /^[a-z0-9]{4,16}$/.test(id) ? id : null
}

// id로 서버에서 payload 조회 (비동기)
export async function fetchSharedById(id: string): Promise<ShareData | null> {
  try {
    const res = await fetch(apiUrl(`/api/share?id=${encodeURIComponent(id)}`))
    if (!res.ok) return null
    return unpack((await res.json()) as Packed)
  } catch {
    return null
  }
}
