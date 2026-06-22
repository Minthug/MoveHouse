import { useEffect, useRef } from 'react'
import type { Destination, CandidateLocation, AppMode } from '../types'

const CANDIDATE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899']

interface UseNaverMapProps {
  mapContainerRef: React.RefObject<HTMLDivElement | null>
  mode: AppMode
  destination: Destination | null
  candidates: CandidateLocation[]
  onMapClick: (lat: number, lng: number, address: string) => void
}

function reverseGeocode(
  lat: number,
  lng: number,
  callback: (address: string) => void,
) {
  if (!window.naver?.maps?.Service) {
    callback(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
    return
  }
  window.naver.maps.Service.reverseGeocode(
    {
      coords: new window.naver.maps.LatLng(lat, lng),
      orders: [
        window.naver.maps.Service.OrderType.ROAD_ADDR,
        window.naver.maps.Service.OrderType.ADDR,
      ],
    },
    (status: naver.maps.Service.Status, response: naver.maps.Service.ReverseGeocodeResponse) => {
      if (status === window.naver.maps.Service.Status.ERROR) {
        callback(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
        return
      }
      const addr = response.v2?.address
      const name =
        addr?.roadAddress ||
        addr?.jibunAddress ||
        `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      callback(name)
    },
  )
}

export function useNaverMap({
  mapContainerRef,
  mode,
  destination,
  candidates,
  onMapClick,
}: UseNaverMapProps) {
  const mapRef = useRef<naver.maps.Map | null>(null)
  const markersRef = useRef<naver.maps.Marker[]>([])
  const modeRef = useRef(mode)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return
    if (!window.naver?.maps) return

    const map = new window.naver.maps.Map(mapContainerRef.current, {
      center: new window.naver.maps.LatLng(37.5665, 126.978),
      zoom: 12,
    })
    mapRef.current = map

    window.naver.maps.Event.addListener(
      map,
      'click',
      (e: naver.maps.PointerEvent) => {
        const lat = e.coord.y
        const lng = e.coord.x
        reverseGeocode(lat, lng, (address) => {
          onMapClick(lat, lng, address)
        })
      },
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync markers
  useEffect(() => {
    if (!mapRef.current) return

    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []

    if (destination) {
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(destination.lat, destination.lng),
        map: mapRef.current,
        icon: {
          content: `<div class="destination-marker">★</div>`,
          anchor: new window.naver.maps.Point(18, 18),
        },
        title: destination.name,
      })
      markersRef.current.push(marker)
    }

    candidates.forEach((c, i) => {
      const color = CANDIDATE_COLORS[i % CANDIDATE_COLORS.length]
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(c.lat, c.lng),
        map: mapRef.current!,
        icon: {
          content: `<div class="candidate-marker" style="background:${color}">${c.label}</div>`,
          anchor: new window.naver.maps.Point(18, 18),
        },
        title: c.name,
      })
      markersRef.current.push(marker)
    })
  }, [destination, candidates])

  return { map: mapRef.current }
}
