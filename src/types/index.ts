export interface Coordinate {
  lat: number
  lng: number
}

export interface Location extends Coordinate {
  id: string
  name: string
}

export interface RouteResult {
  duration: number // minutes
  fare: number     // KRW
  distance: number // meters
}

export interface CandidateRoutes {
  transit?: RouteResult
  driving?: RouteResult
  walk?: RouteResult
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
