import type { Coordinate, RouteResult, RouteStep, CandidateRoutes } from '../types'

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

interface OdsaySubPath {
  trafficType: 1 | 2 | 3  // 1=지하철 2=버스 3=도보
  sectionTime: number
  startName?: string
  endName?: string
  lane?: Array<{ name?: string; busNo?: string }>
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

function parseSteps(subPaths: OdsaySubPath[]): RouteStep[] {
  return subPaths.map((sp) => {
    if (sp.trafficType === 1) {
      return {
        type: 'subway' as const,
        name: sp.lane?.[0]?.name,
        from: sp.startName,
        to: sp.endName,
        duration: sp.sectionTime,
      }
    }
    if (sp.trafficType === 2) {
      return {
        type: 'bus' as const,
        name: sp.lane?.[0]?.busNo,
        from: sp.startName,
        to: sp.endName,
        duration: sp.sectionTime,
      }
    }
    return { type: 'walk' as const, duration: sp.sectionTime }
  })
}

async function fetchTransitRoute(
  origin: Coordinate,
  destination: Coordinate,
): Promise<{ duration: number; fare: number; steps: RouteStep[] } | null> {
  try {
    const params = new URLSearchParams({
      SX: String(origin.lng),
      SY: String(origin.lat),
      EX: String(destination.lng),
      EY: String(destination.lat),
      OPT: '1',
      SearchType: '0',
      SearchPathType: '0',
    })
    const res = await fetch(`/api/transit?${params}`)
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

export async function getRoutes(
  origin: Coordinate,
  destination: Coordinate,
): Promise<CandidateRoutes> {
  const distanceM = haversineDistance(origin, destination)
  const walkDuration = Math.round(distanceM / 67) // 4km/h ≈ 67m/min

  const transit = await fetchTransitRoute(origin, destination)

  const transitResult: RouteResult | undefined = transit
    ? {
        duration: transit.duration,
        fare: transit.fare,
        distance: distanceM,
        steps: transit.steps,
      }
    : undefined

  const walkResult: RouteResult = {
    duration: walkDuration,
    fare: 0,
    distance: distanceM,
  }

  return {
    transit: transitResult,
    walk: walkResult,
  }
}

export function calcMonthlyFare(farePerTrip: number, workingDays = 22): number {
  return farePerTrip * workingDays * 2
}
