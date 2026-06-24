import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import type { Feature, FeatureCollection } from 'geojson'
import {
  fetchSeoulGeoJSON,
  fetchSeoulDongGeoJSON,
  getDistrictName,
  getDistrictCode,
  getDistrictColor,
  getDongName,
  filterDongByGuCode,
  getDongColor,
} from '../data/seoulDistricts'
import { SUBWAY_LINES } from '../data/seoulSubway'
import { HAN_RIVER_OUTER, HAN_RIVER_HOLES } from '../data/hanRiver'
import type { Destination, CandidateLocation, AppMode } from '../types'

const CANDIDATE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899']

function makeCandidateIcon(label: string, color: string) {
  return L.divIcon({
    html: `<div class="candidate-marker" style="background:${color}">${label}</div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })
}

interface UseLeafletMapProps {
  mapContainerRef: React.RefObject<HTMLDivElement | null>
  mode: AppMode
  destination: Destination | null
  candidates: CandidateLocation[]
  selectedCandidateId: string | null
  onDistrictClick: (name: string, lat: number, lng: number) => void
  showSubway: boolean
}

export function useLeafletMap({
  mapContainerRef,
  mode,
  destination,
  candidates,
  selectedCandidateId,
  onDistrictClick,
  showSubway,
}: UseLeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const geoLayerRef = useRef<L.GeoJSON | null>(null)
  const dongLayerRef = useRef<L.GeoJSON | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const guBoundsRef = useRef<Map<string, L.LatLngBounds>>(new Map())
  const guCodeMapRef = useRef<Map<string, string>>(new Map())
  const subwayLayerGroupRef = useRef<L.LayerGroup | null>(null)
  const seoulBoundsRef = useRef<L.LatLngBounds | null>(null)
  const destMarkerRef = useRef<L.Marker | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)

  // Refs for values used inside stable closures
  const destRef = useRef(destination)
  const candidatesRef = useRef(candidates)
  const onClickRef = useRef(onDistrictClick)

  useEffect(() => { destRef.current = destination }, [destination])
  useEffect(() => { candidatesRef.current = candidates }, [candidates])
  useEffect(() => { onClickRef.current = onDistrictClick }, [onDistrictClick])

  // Drill-down state: which 구 is currently zoomed in
  const [zoomedGu, setZoomedGu] = useState<string | null>(null)
  const zoomedGuRef = useRef(zoomedGu)
  useEffect(() => { zoomedGuRef.current = zoomedGu }, [zoomedGu])

  // ── Map init ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return
    let active = true

    const map = L.map(mapContainerRef.current, {
      center: [37.565, 126.978],
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
    })

    // 한강 pane — 구 레이어(overlayPane 400)보다 위, 지하철보다 아래
    map.createPane('hanRiverPane')
    map.getPane('hanRiverPane')!.style.zIndex = '420'
    map.getPane('hanRiverPane')!.style.pointerEvents = 'none'

    // 한강 폴리곤
    L.polygon([HAN_RIVER_OUTER, ...HAN_RIVER_HOLES], {
      pane: 'hanRiverPane',
      fillColor: '#5b9fd4',
      fillOpacity: 0.65,
      color: '#3d84bb',
      weight: 1.5,
      interactive: false,
    })
      .bindTooltip('한강', { permanent: false, className: 'river-tooltip' })
      .addTo(map)

    // 지하철 레이어 전용 pane — overlayPane(400)보다 높게 설정해 항상 최상단 유지
    map.createPane('subwayPane')
    const subwayPane = map.getPane('subwayPane')!
    subwayPane.style.zIndex = '450'
    subwayPane.style.pointerEvents = 'none'  // 지도 클릭 방해 안 하도록

    // 역 마커 전용 pane (툴팁 인터랙션을 위해 pointerEvents 활성화)
    map.createPane('subwayMarkerPane')
    const subwayMarkerPane = map.getPane('subwayMarkerPane')!
    subwayMarkerPane.style.zIndex = '460'

    mapRef.current = map

    fetchSeoulGeoJSON()
      .then((geo) => {
        if (!active || !mapRef.current) return
        buildGuLayer(map, geo)
      })
      .catch(console.error)

    return () => {
      active = false
      map.remove()
      mapRef.current = null
      geoLayerRef.current = null
      dongLayerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build 구 layer ────────────────────────────────────────────────────
  function buildGuLayer(map: L.Map, geoJSON: FeatureCollection) {
    let idx = 0
    const layer = L.geoJSON(geoJSON, {
      style: (feature) => baseGuStyle(feature as Feature, idx++),
      onEachFeature: (feature: Feature, featureLayer) => {
        const name = getDistrictName(feature)

        featureLayer.bindTooltip(name, {
          permanent: true,
          direction: 'center',
          className: 'district-label',
        })

        featureLayer.on({
          mouseover(e) {
            const l = e.target as L.Path
            const isSelected =
              destRef.current?.name === name ||
              candidatesRef.current.some((c) => c.name === name)
            if (!isSelected) l.setStyle({ fillOpacity: 0.92, weight: 2 })
            l.bringToFront()
          },
          mouseout(e) {
            const l = e.target as L.Path
            const isSelected =
              destRef.current?.name === name ||
              candidatesRef.current.some((c) => c.name === name)
            if (!isSelected) l.setStyle({ fillOpacity: 0.7, weight: 1.5 })
          },
          click() {
            const center = (featureLayer as L.Polygon).getBounds().getCenter()
            onClickRef.current(name, center.lat, center.lng)
            setZoomedGu(name)
          },
        })

        // Store per-구 bounds and code for later zoom + dong filtering
        guBoundsRef.current.set(name, (featureLayer as L.Polygon).getBounds())
        guCodeMapRef.current.set(name, getDistrictCode(feature))
      },
    })

    // Re-apply indexed colors (idx was mutated during style callback)
    idx = 0
    layer.eachLayer((l) => {
      const f = (l as L.GeoJSON & { feature: Feature }).feature
      ;(l as L.Path).setStyle(baseGuStyle(f, idx++))
    })

    layer.addTo(map)
    geoLayerRef.current = layer

    const bounds = layer.getBounds()
    seoulBoundsRef.current = bounds
    map.fitBounds(bounds, { padding: [20, 20] })
  }

  // ── Drill-down: show 동 when a 구 is selected ─────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear previous 동 layer
    if (dongLayerRef.current) {
      dongLayerRef.current.remove()
      dongLayerRef.current = null
    }

    if (!zoomedGu) {
      // Zoom back to all Seoul
      if (seoulBoundsRef.current) {
        map.fitBounds(seoulBoundsRef.current, { padding: [20, 20] })
      }
      return
    }

    // Zoom to clicked 구
    const guBounds = guBoundsRef.current.get(zoomedGu)
    if (guBounds) map.fitBounds(guBounds, { padding: [40, 40] })

    // Fetch 동 GeoJSON and show filtered features
    const guCode = guCodeMapRef.current.get(zoomedGu) ?? ''
    fetchSeoulDongGeoJSON()
      .then((geo) => {
        if (!mapRef.current || zoomedGuRef.current !== zoomedGu) return
        buildDongLayer(mapRef.current, geo, zoomedGu, guCode)
      })
      .catch(console.error)
  }, [zoomedGu]) // eslint-disable-line react-hooks/exhaustive-deps

  function buildDongLayer(map: L.Map, geo: FeatureCollection, guName: string, guCode: string) {
    const filtered: FeatureCollection = {
      type: 'FeatureCollection',
      features: filterDongByGuCode(geo.features as Feature[], guCode),
    }

    if (filtered.features.length === 0) {
      console.warn(`${guName}(${guCode})에 대한 동 데이터가 없습니다`)
      return
    }

    let idx = 0
    const layer = L.geoJSON(filtered, {
      style: () => ({
        fillColor: getDongColor(idx++),
        fillOpacity: 1,
        color: '#ffffff',
        weight: 1.2,
      }),
      onEachFeature: (feature: Feature, featureLayer) => {
        const name = getDongName(feature)

        featureLayer.bindTooltip(name, {
          permanent: true,
          direction: 'center',
          className: 'dong-label',
        })

        featureLayer.on({
          mouseover(e) {
            ;(e.target as L.Path).setStyle({ fillOpacity: 0.92, weight: 2 })
            ;(e.target as L.Path).bringToFront()
          },
          mouseout(e) {
            ;(e.target as L.Path).setStyle({ fillOpacity: 1, weight: 1.2 })
          },
        })
      },
    })

    // Re-color with index
    idx = 0
    layer.eachLayer((l) => {
      ;(l as L.Path).setStyle({ fillColor: getDongColor(idx++) })
    })

    layer.addTo(map)
    dongLayerRef.current = layer
  }

  // ── Re-style 구 on destination / candidates change ────────────────────
  useEffect(() => {
    const layer = geoLayerRef.current
    if (!layer) return

    let idx = 0
    layer.eachLayer((l) => {
      const feature = (l as L.GeoJSON & { feature: Feature }).feature
      const name = getDistrictName(feature)

      if (destination?.name === name) {
        ;(l as L.Path).setStyle({ fillColor: '#ef4444', fillOpacity: 0.85, weight: 2.5, color: '#fff' })
      } else if (candidates.some((c) => c.name === name)) {
        const ci = candidates.findIndex((c) => c.name === name)
        ;(l as L.Path).setStyle({
          fillColor: CANDIDATE_COLORS[ci % CANDIDATE_COLORS.length],
          fillOpacity: 0.75, weight: 2, color: '#fff',
        })
      } else {
        ;(l as L.Path).setStyle({ ...baseGuStyle(feature, idx), fillOpacity: 0.7 })
      }
      idx++
    })
  }, [destination, candidates])

  // ── Destination marker ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    destMarkerRef.current?.remove()
    destMarkerRef.current = null

    if (!destination) return

    const icon = L.divIcon({
      html: `<div class="destination-marker">★</div>`,
      className: '',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    })

    destMarkerRef.current = L.marker([destination.lat, destination.lng], {
      icon,
      interactive: false,
    }).addTo(map)

    map.flyTo([destination.lat, destination.lng], 14, { duration: 0.8 })
  }, [destination])

  // ── Candidate markers ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    candidates.forEach((c, i) => {
      const color = CANDIDATE_COLORS[i % CANDIDATE_COLORS.length]
      const m = L.marker([c.lat, c.lng], {
        icon: makeCandidateIcon(c.label, color),
        interactive: false,
      }).addTo(map)
      markersRef.current.push(m)
    })
  }, [candidates])

  // ── Selected candidate route ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    routeLayerRef.current?.remove()
    routeLayerRef.current = null

    if (!selectedCandidateId) return

    const candidate = candidates.find((c) => c.id === selectedCandidateId)
    const steps = candidate?.routes?.transit?.steps
    if (!steps) return

    const group = L.layerGroup()

    for (const step of steps) {
      if (!step.coords || step.coords.length < 2) continue
      L.polyline(step.coords, {
        color: step.color ?? '#6b7280',
        weight: 5,
        opacity: 0.85,
      }).addTo(group)
    }

    group.addTo(map)
    routeLayerRef.current = group

    // 경로 전체가 보이도록 bounds 맞춤
    const allCoords = steps.flatMap((s) => s.coords ?? [])
    if (allCoords.length > 1) {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40] })
    }
  }, [selectedCandidateId, candidates])

  // ── Subway overlay ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!showSubway) {
      subwayLayerGroupRef.current?.remove()
      subwayLayerGroupRef.current = null
      return
    }

    if (subwayLayerGroupRef.current) return // already shown

    const group = L.layerGroup()

    for (const line of SUBWAY_LINES) {
      const latlngs = line.stations.map((s) => [s.lat, s.lng] as L.LatLngTuple)

      L.polyline(latlngs, {
        color: line.color,
        weight: 3.5,
        opacity: 0.9,
        interactive: false,
        pane: 'subwayPane',
      }).addTo(group)

      for (const station of line.stations) {
        const icon = L.divIcon({
          html: `<div class="subway-pin">
            <div class="subway-pin-dot" style="background:${line.color};box-shadow:0 0 0 2px white,0 1px 4px rgba(0,0,0,.4)"></div>
            <span class="subway-pin-name">${station.name}</span>
          </div>`,
          className: '',
          iconSize: [0, 0],
          iconAnchor: [5, 5],
        })

        L.marker([station.lat, station.lng], {
          icon,
          interactive: false,
          pane: 'subwayMarkerPane',
        }).addTo(group)
      }
    }

    group.addTo(map)
    subwayLayerGroupRef.current = group

    // zoom level에 따라 역 이름 표시 토글 (CSS 클래스로 처리)
    const container = map.getContainer()
    const updateZoomClass = () => {
      if (map.getZoom() >= 12) {
        container.classList.add('subway-zoom-labels')
      } else {
        container.classList.remove('subway-zoom-labels')
      }
    }
    updateZoomClass()
    map.on('zoomend', updateZoomClass)
  }, [showSubway]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    zoomedGu,
    onBack: () => setZoomedGu(null),
  }
}

function baseGuStyle(feature: Feature | undefined, index: number): L.PathOptions {
  return {
    fillColor: getDistrictColor(index < 0 ? 0 : index),
    fillOpacity: 0.7,
    color: '#ffffff',
    weight: 1.5,
  }
}
