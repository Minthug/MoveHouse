import type { Coordinate, RouteStep, CandidateRoutes } from '../types'
import { apiUrl } from '../lib/api'

function haversineDistance(a: Coordinate, b: Coordinate): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const x =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng *
      sinDLng
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

interface OdsayStation {
  x: string  // lng
  y: string  // lat
}

interface OdsaySubPath {
  trafficType: 1 | 2 | 3
  sectionTime: number
  startName?: string
  endName?: string
  lane?: Array<{ name?: string; busNo?: string; subwayCode?: number }>
  passStopList?: { stations: OdsayStation[] }
}

interface OdsayPath {
  info: {
    totalTime: number
    payment: number
    busTransitCount: number
    subwayTransitCount: number
  }
  subPath: OdsaySubPath[]
}

interface OdsayResponse {
  result?: { path?: OdsayPath[] }
  error?: unknown
}

const SUBWAY_COLORS: Record<number, string> = {
  1: '#0052A4', 2: '#00A84D', 3: '#EF7C1C', 4: '#00A5DE',
  5: '#996CAC', 6: '#CD7C2F', 7: '#747F00', 8: '#E6186C',
  9: '#BDB092', 100: '#D31145', 101: '#0090D2',
}

function parseSteps(subPaths: OdsaySubPath[]): RouteStep[] {
  const steps: RouteStep[] = subPaths.map((sp) => {
    const stations = sp.passStopList?.stations ?? []
    const coords: [number, number][] = stations
      .filter((s) => s.x && s.y)
      .map((s) => [parseFloat(s.y), parseFloat(s.x)])

    if (sp.trafficType === 1) {
      const code = sp.lane?.[0]?.subwayCode
      return {
        type: 'subway' as const,
        name: sp.lane?.[0]?.name,
        from: sp.startName,
        to: sp.endName,
        duration: sp.sectionTime,
        coords,
        color: code ? (SUBWAY_COLORS[code] ?? '#6b7280') : '#6b7280',
      }
    }
    if (sp.trafficType === 2) {
      return {
        type: 'bus' as const,
        name: sp.lane?.[0]?.busNo,
        from: sp.startName,
        to: sp.endName,
        duration: sp.sectionTime,
        coords,
        color: '#22c55e',
      }
    }
    return { type: 'walk' as const, duration: sp.sectionTime }
  })

  // 도보 구간에 좌표 채우기: 앞 구간 끝점 → 뒷 구간 시작점 직선
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].type !== 'walk') continue
    const prev = steps.slice(0, i).reverse().find((s) => s.coords?.length)
    const next = steps.slice(i + 1).find((s) => s.coords?.length)
    const from = prev?.coords?.at(-1)
    const to = next?.coords?.[0]
    if (from && to) steps[i].coords = [from, to]
  }

  return steps
}

async function fetchTransitRoute(
  origin: Coordinate,
  destination: Coordinate,
  searchPathType: '0' | '2' = '0',
): Promise<{ duration: number; fare: number; steps: RouteStep[] } | null> {
  try {
    const params = new URLSearchParams({
      SX: String(origin.lng),
      SY: String(origin.lat),
      EX: String(destination.lng),
      EY: String(destination.lat),
      OPT: '1',
      SearchType: '0',
      SearchPathType: searchPathType,
    })
    const res = await fetch(apiUrl(`/api/transit?${params}`))
    if (!res.ok) return null
    const data: OdsayResponse = await res.json()
    const best = data.result?.path?.[0]
    if (!best) return null
    return {
      duration: best.info.totalTime,
      fare: best.info.payment,
      steps: parseSteps(best.subPath),
    }
  } catch {
    return null
  }
}

// (출발지→목적지) 경로 캐시 + 진행중 요청 공유
// — StrictMode 이중 실행/보드 재진입 시 동일 ODSAY 호출 중복(→429)을 막는다.
const routeCache = new Map<string, CandidateRoutes>()
const routeInflight = new Map<string, Promise<CandidateRoutes>>()
const routeKey = (o: Coordinate, d: Coordinate) =>
  `${o.lat.toFixed(5)},${o.lng.toFixed(5)}|${d.lat.toFixed(5)},${d.lng.toFixed(5)}`

export function getRoutes(origin: Coordinate, destination: Coordinate): Promise<CandidateRoutes> {
  const k = routeKey(origin, destination)
  const cached = routeCache.get(k)
  if (cached) return Promise.resolve(cached)
  const pending = routeInflight.get(k)
  if (pending) return pending
  const promise = computeRoutes(origin, destination).then((res) => {
    // transit이 실제로 잡힌 경우만 캐시 (실패는 재시도 가능하게)
    if (res.transit) routeCache.set(k, res)
    routeInflight.delete(k)
    return res
  }).catch((e) => { routeInflight.delete(k); throw e })
  routeInflight.set(k, promise)
  return promise
}

async function computeRoutes(
  origin: Coordinate,
  destination: Coordinate,
): Promise<CandidateRoutes> {
  const distanceM = haversineDistance(origin, destination)
  const [transit, busResult] = await Promise.all([
    fetchTransitRoute(origin, destination, '0'),
    fetchTransitRoute(origin, destination, '2'),
  ])

  // SearchPathType=0은 전체 대중교통 최적(버스+지하철 혼합 포함),
  // SearchPathType=2는 버스 우선 대체안이다.
  // null = 조회했지만 최적 경로와 의미있는 차이 없음 / undefined = 미조회
  const isBusMeaningful =
    busResult &&
    (transit
      ? Math.abs(busResult.duration - transit.duration) >= 3 ||
        busResult.steps.some((s) => s.type === 'bus')
      : true)

  return {
    transit: transit
      ? { duration: transit.duration, fare: transit.fare, distance: distanceM, steps: transit.steps }
      : undefined,
    bus: busResult
      ? isBusMeaningful
        ? { duration: busResult.duration, fare: busResult.fare, distance: distanceM, steps: busResult.steps }
        : null   // 조회 완료, 차이 없음
      : null,    // API 실패도 null로 처리
  }
}

export function calcMonthlyFare(farePerTrip: number, workingDays = 22): number {
  return farePerTrip * workingDays * 2
}
