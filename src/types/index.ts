export interface Coordinate {
  lat: number
  lng: number
}

export interface Location extends Coordinate {
  id: string
  name: string
}

export interface RouteStep {
  type: 'subway' | 'bus' | 'walk'
  name?: string
  from?: string
  to?: string
  duration: number
  coords?: [number, number][]  // [lat, lng]
  color?: string
}

export interface RouteResult {
  duration: number // minutes
  fare: number     // KRW
  distance: number // meters
  steps?: RouteStep[]
}

export interface CandidateRoutes {
  transit?: RouteResult   // 지하철 최적
  bus?: RouteResult | null // 버스 우선: undefined=미조회, null=조회했지만 지하철과 차이 없음
}

export interface CandidateLocation extends Location {
  label: string // A, B, C, D, E
  routes: CandidateRoutes
  loading: boolean
  error?: string
}

export type AppMode = 'set-destination' | 'add-candidate'

export type DestinationType = 'work' | 'school' | 'other'

export interface Destination extends Location {
  type: DestinationType
}
