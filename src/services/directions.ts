import type { Coordinate, RouteResult, CandidateRoutes } from '../types'

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

function calcTransitFare(distanceM: number): number {
  const km = distanceM / 1000
  if (km <= 10) return 1400
  if (km <= 40) return 1400 + Math.ceil((km - 10) / 5) * 100
  return 1400 + 600 + Math.ceil((km - 40) / 10) * 100
}

interface NaverDirectionsResponse {
  code: number
  message: string
  route?: {
    traoptimal?: Array<{
      summary: {
        duration: number  // ms
        distance: number  // meters
        taxiFare: number
        tollFare: number
      }
    }>
  }
}

async function fetchDrivingRoute(
  origin: Coordinate,
  destination: Coordinate,
): Promise<{ duration: number; distance: number } | null> {
  try {
    const params = new URLSearchParams({
      start: `${origin.lng},${origin.lat}`,
      goal: `${destination.lng},${destination.lat}`,
      option: 'traoptimal',
    })
    const res = await fetch(`/api/directions?${params}`)
    if (!res.ok) return null
    const data: NaverDirectionsResponse = await res.json()
    const summary = data.route?.traoptimal?.[0]?.summary
    if (!summary) return null
    return {
      duration: Math.round(summary.duration / 60000), // ms → minutes
      distance: summary.distance,
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

  const driving = await fetchDrivingRoute(origin, destination)

  const drivingResult: RouteResult | undefined = driving
    ? {
        duration: driving.duration,
        fare: 0,
        distance: driving.distance,
      }
    : undefined

  // Transit approximation: driving * 1.4 (Seoul average)
  const transitResult: RouteResult | undefined = driving
    ? {
        duration: Math.round(driving.duration * 1.4),
        fare: calcTransitFare(driving.distance),
        distance: driving.distance,
      }
    : undefined

  const walkResult: RouteResult = {
    duration: walkDuration,
    fare: 0,
    distance: distanceM,
  }

  return {
    transit: transitResult,
    driving: drivingResult,
    walk: walkResult,
  }
}

export function calcMonthlyFare(farePerTrip: number, workingDays = 22): number {
  return farePerTrip * workingDays * 2
}
