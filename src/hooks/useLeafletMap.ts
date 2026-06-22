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
  onDistrictClick: (name: string, lat: number, lng: number) => void
}

export function useLeafletMap({
  mapContainerRef,
  mode,
  destination,
  candidates,
  onDistrictClick,
}: UseLeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const geoLayerRef = useRef<L.GeoJSON | null>(null)
  const dongLayerRef = useRef<L.GeoJSON | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const guBoundsRef = useRef<Map<string, L.LatLngBounds>>(new Map())
  const guCodeMapRef = useRef<Map<string, string>>(new Map())
  const seoulBoundsRef = useRef<L.LatLngBounds | null>(null)

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
