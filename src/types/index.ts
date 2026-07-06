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
  routes: CandidateRoutes    // → 주 목적지(destination)
  routes2?: CandidateRoutes  // → 보조 목적지(destination2), 없으면 미설정
  loading: boolean
  loading2?: boolean
  error?: string
  error2?: string
  memo?: string
  rent?: number // 월세 (원). 실질 월 비용 = 월세 + 월 교통비
}

// 비교 보드: 목적지(+보조) + 후보지 세트 하나 (노션 클립보드처럼 여러 개 전환)
export interface Board {
  id: string
  name: string
  destination: Destination | null
  destination2: Destination | null
  candidates: CandidateLocation[]
}

export type AppMode = 'set-destination' | 'add-candidate'

export type DestinationType = 'work' | 'school' | 'other'

export interface Destination extends Location {
  type: DestinationType
}
