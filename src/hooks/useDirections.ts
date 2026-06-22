import { useCallback } from 'react'
import { getRoutes } from '../services/directions'
import type { Coordinate } from '../types'

export function useDirections() {
  const fetchRoutes = useCallback(
    async (origin: Coordinate, destination: Coordinate) => {
      return getRoutes(origin, destination)
    },
    [],
  )

  return { fetchRoutes }
}
