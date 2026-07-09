import { useEffect, useRef, useState, useCallback } from 'react'
import type { AppMode, CandidateLocation, Destination, RouteResult } from '../types'
import { PLACE_CATEGORIES } from '../services/places'
import type { NearbyPlace } from '../services/places'
import { SUBWAY_LINES } from '../data/subway-lines'
import { METRO } from '../data/metro-data'

// Least-squares calibration: SVG centroid ↔ WGS84 (25구 기준)
const SVG_TO_LNG = (cx: number) => cx * 0.00040091 + 126.774831
const SVG_TO_LAT = (cy: number) => cy * -0.00032220 + 37.691944
const LNG_TO_SVG = (lng: number) => (lng - 126.774831) / 0.00040091
const LAT_TO_SVG = (lat: number) => (lat - 37.691944) / -0.00032220


interface GuData {
  name: string
  code: string
  d: string
  cx: number
  cy: number
  bbox: [number, number, number, number]
}
interface DongData {
  name: string
  code: string
  gu: string
  d: string
  cx: number
  cy: number
}
interface SeoulData {
  districts: GuData[]
  river: string[]
}
interface DongSeoulData {
  dong: DongData[]
}

const CANDIDATE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899']
const FULL_VIEWBOX: [number, number, number, number] = [-468, -323, 1999, 1599]
const MAP_ASPECT = 1000 / 800

// 경로선 외곽 캐싱용 어두운 색 (밝은 지도 위 대비 확보)
function darken(hex: string, f = 0.55): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * f)
  const g = Math.round(((n >> 8) & 255) * f)
  const b = Math.round((n & 255) * f)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
const GU_NAMES = [
  '강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구',
  '노원구','도봉구','동대문구','동작구','마포구','서대문구','서초구','성동구',
  '성북구','송파구','양천구','영등포구','용산구','은평구','종로구','중구','중랑구',
]

function extractGuName(address: string): string | null {
  return GU_NAMES.find((g) => address.includes(g)) ?? null
}

function aspectFit(bbox: [number, number, number, number]): [number, number, number, number] {
  let [x, y, w, h] = bbox
  const px = w * 0.28, py = h * 0.28
  x -= px; y -= py; w += px * 2; h += py * 2
  if (w / h < MAP_ASPECT) { const nw = h * MAP_ASPECT; x -= (nw - w) / 2; w = nw }
  else { const nh = w / MAP_ASPECT; y -= (nh - h) / 2; h = nh }
  return [x, y, w, h]
}

function fitPoints(points: Array<[number, number]>, minWidth = 620): [number, number, number, number] {
  if (points.length === 0) return FULL_VIEWBOX
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  let x = Math.min(...xs)
  let y = Math.min(...ys)
  let w = Math.max(...xs) - x
  let h = Math.max(...ys) - y
  const pad = Math.max(120, Math.max(w, h) * 0.24)
  x -= pad; y -= pad; w += pad * 2; h += pad * 2
  if (w < minWidth) { x -= (minWidth - w) / 2; w = minWidth }
  const minHeight = minWidth / MAP_ASPECT
  if (h < minHeight) { y -= (minHeight - h) / 2; h = minHeight }
  if (w / h < MAP_ASPECT) { const nw = h * MAP_ASPECT; x -= (nw - w) / 2; w = nw }
  else { const nh = w / MAP_ASPECT; y -= (nh - h) / 2; h = nh }
  return [x, y, w, h]
}

const EASE = (t: number) => 1 - Math.pow(1 - t, 3)
const MIN_VIEW_WIDTH = 260

interface Props {
  mode: AppMode
  destination: Destination | null
  destination2?: Destination | null
  candidates: CandidateLocation[]
  selectedCandidateId: string | null
  selectedRouteType: 'transit' | 'bus'
  nearbyPlaces: NearbyPlace[]
  onDistrictClick: (name: string, lat: number, lng: number) => void
}

export default function SeoulMap({ mode, destination, destination2, candidates, selectedCandidateId, selectedRouteType, nearbyPlaces, onDistrictClick }: Props) {
  const [guData, setGuData] = useState<SeoulData | null>(null)
  const [dongData, setDongData] = useState<DongSeoulData | null>(null)
  const [viewMode, setViewMode] = useState<'gu' | 'dong'>('gu')
  const [selGu, setSelGu] = useState<GuData | null>(null)
  const [selDong, setSelDong] = useState<DongData | null>(null)
  const [hoveredGu, setHoveredGu] = useState<string | null>(null)
  const [viewBox, setViewBox] = useState<[number, number, number, number]>(FULL_VIEWBOX)
  const vbRef = useRef<[number, number, number, number]>(FULL_VIEWBOX)
  const rafRef = useRef(0)
  const svgRef = useRef<SVGSVGElement>(null)
  const pinchRef = useRef<{ distance: number; viewBox: [number, number, number, number] } | null>(null)
  const panRef = useRef<{ x: number; y: number; viewBox: [number, number, number, number]; moved: boolean } | null>(null)
  const suppressTapRef = useRef(false)

  useEffect(() => {
    Promise.all([
      import('../data/seoul-data'),
      import('../data/seoul-dong-data'),
    ])
      .then(([a, b]) => {
        setGuData((a as unknown as { SEOUL: SeoulData }).SEOUL)
        setDongData((b as unknown as { DONG: DongSeoulData }).DONG)
      })
      .catch(console.error)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  function zoomTo(target: [number, number, number, number], duration = 560) {
    cancelAnimationFrame(rafRef.current)
    const start = vbRef.current.slice() as [number, number, number, number]
    const t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const e = EASE(p)
      const cur = start.map((s, i) => s + (target[i] - s) * e) as [number, number, number, number]
      vbRef.current = cur
      setViewBox(cur)
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }

  function applyViewBox(next: [number, number, number, number]) {
    cancelAnimationFrame(rafRef.current)
    vbRef.current = next
    setViewBox(next)
  }

  function clientToSvgPoint(clientX: number, clientY: number): [number, number] {
    const svg = svgRef.current
    if (!svg) return [vbRef.current[0] + vbRef.current[2] / 2, vbRef.current[1] + vbRef.current[3] / 2]

    const rect = svg.getBoundingClientRect()
    const [x, y, w, h] = vbRef.current
    const svgAspect = w / h
    const rectAspect = rect.width / rect.height

    let drawW = rect.width
    let drawH = rect.height
    let offsetX = 0
    let offsetY = 0
    if (rectAspect > svgAspect) {
      drawW = rect.height * svgAspect
      offsetX = (rect.width - drawW) / 2
    } else {
      drawH = rect.width / svgAspect
      offsetY = (rect.height - drawH) / 2
    }

    const px = Math.min(1, Math.max(0, (clientX - rect.left - offsetX) / drawW))
    const py = Math.min(1, Math.max(0, (clientY - rect.top - offsetY) / drawH))
    return [x + px * w, y + py * h]
  }

  function zoomBy(factor: number, center?: [number, number], animate = true) {
    const [x, y, w, h] = vbRef.current
    const cx = center?.[0] ?? x + w / 2
    const cy = center?.[1] ?? y + h / 2
    const nextW = Math.max(MIN_VIEW_WIDTH, Math.min(FULL_VIEWBOX[2], w * factor))
    const nextH = nextW / MAP_ASPECT
    const rx = (cx - x) / w
    const ry = (cy - y) / h
    const next: [number, number, number, number] = [
      cx - nextW * rx,
      cy - nextH * ry,
      nextW,
      nextH,
    ]
    if (animate) zoomTo(next, 220)
    else applyViewBox(next)
  }

  function touchDistance(touches: TouchList) {
    const a = touches[0]
    const b = touches[1]
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  function handleTouchStart(e: React.TouchEvent<SVGSVGElement>) {
    if (e.touches.length === 2) {
      panRef.current = null
      pinchRef.current = { distance: touchDistance(e.touches), viewBox: vbRef.current.slice() as [number, number, number, number] }
      return
    }
    if (e.touches.length === 1) {
      const t = e.touches[0]
      pinchRef.current = null
      panRef.current = { x: t.clientX, y: t.clientY, viewBox: vbRef.current.slice() as [number, number, number, number], moved: false }
    }
  }

  function handleTouchMove(e: React.TouchEvent<SVGSVGElement>) {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const start = pinchRef.current
      const dist = touchDistance(e.touches)
      if (dist <= 0) return
      const center = clientToSvgPoint(
        (e.touches[0].clientX + e.touches[1].clientX) / 2,
        (e.touches[0].clientY + e.touches[1].clientY) / 2,
      )
      const factor = start.distance / dist
      const [x, y, w, h] = start.viewBox
      vbRef.current = start.viewBox
      const cx = center[0]
      const cy = center[1]
      const nextW = Math.max(MIN_VIEW_WIDTH, Math.min(FULL_VIEWBOX[2], w * factor))
      const nextH = nextW / MAP_ASPECT
      const rx = (cx - x) / w
      const ry = (cy - y) / h
      applyViewBox([cx - nextW * rx, cy - nextH * ry, nextW, nextH])
      suppressTapRef.current = true
      return
    }

    if (e.touches.length === 1 && panRef.current) {
      const svg = svgRef.current
      if (!svg) return
      const t = e.touches[0]
      const dx = t.clientX - panRef.current.x
      const dy = t.clientY - panRef.current.y
      if (Math.hypot(dx, dy) < 6 && !panRef.current.moved) return
      e.preventDefault()
      panRef.current.moved = true
      suppressTapRef.current = true

      const rect = svg.getBoundingClientRect()
      const [x, y, w, h] = panRef.current.viewBox
      const scaleX = w / rect.width
      const scaleY = h / rect.height
      applyViewBox([x - dx * scaleX, y - dy * scaleY, w, h])
    }
  }

  function handleTouchEnd() {
    if (panRef.current?.moved) suppressTapRef.current = true
    panRef.current = null
    pinchRef.current = null
    window.setTimeout(() => { suppressTapRef.current = false }, 0)
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault()
    const center = clientToSvgPoint(e.clientX, e.clientY)
    zoomBy(e.deltaY > 0 ? 1.18 : 0.84, center, false)
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button !== 0) return
    panRef.current = { x: e.clientX, y: e.clientY, viewBox: vbRef.current.slice() as [number, number, number, number], moved: false }
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg || !panRef.current) return
    const dx = e.clientX - panRef.current.x
    const dy = e.clientY - panRef.current.y
    if (Math.hypot(dx, dy) < 4 && !panRef.current.moved) return
    panRef.current.moved = true
    suppressTapRef.current = true

    const rect = svg.getBoundingClientRect()
    const [x, y, w, h] = panRef.current.viewBox
    const scaleX = w / rect.width
    const scaleY = h / rect.height
    applyViewBox([x - dx * scaleX, y - dy * scaleY, w, h])
  }

  function handleMouseUp() {
    if (panRef.current?.moved) suppressTapRef.current = true
    panRef.current = null
    window.setTimeout(() => { suppressTapRef.current = false }, 0)
  }

  function ignoreTapAfterGesture() {
    return suppressTapRef.current
  }

  // 지하철 노선도 토글
  const [visibleLines, setVisibleLines] = useState<Set<string>>(new Set())
  const toggleLine = useCallback((id: string) => {
    setVisibleLines((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const allLinesVisible = visibleLines.size === SUBWAY_LINES.length
  const toggleAllLines = useCallback(() => {
    setVisibleLines((prev) =>
      prev.size === SUBWAY_LINES.length
        ? new Set()
        : new Set(SUBWAY_LINES.map((line) => line.id)),
    )
  }, [])

  // 후보지별 경로 표시 토글 (candidateId → visible)
  const [routeVisible, setRouteVisible] = useState<Set<string>>(new Set())

  const toggleRoute = useCallback((id: string) => {
    setRouteVisible((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // 경로 데이터가 생기면 자동으로 visible 목록에 추가
  useEffect(() => {
    setRouteVisible((prev) => {
      const next = new Set(prev)
      candidates.forEach((c) => { if (c.routes.transit?.steps?.length) next.add(c.id) })
      // 삭제된 후보지 제거
      const ids = new Set(candidates.map((c) => c.id))
      prev.forEach((id) => { if (!ids.has(id)) next.delete(id) })
      return next
    })
  }, [candidates])

  // 경로 선택 시 전체 뷰로 줌아웃해서 경로가 보이도록
  useEffect(() => {
    if (selectedCandidateId) {
      const selected = candidates.find((c) => c.id === selectedCandidateId)
      const points: Array<[number, number]> = []
      if (destination) points.push([LNG_TO_SVG(destination.lng), LAT_TO_SVG(destination.lat)])
      if (destination2) points.push([LNG_TO_SVG(destination2.lng), LAT_TO_SVG(destination2.lat)])
      if (selected) {
        points.push([LNG_TO_SVG(selected.lng), LAT_TO_SVG(selected.lat)])
        const route = (selectedRouteType === 'bus' ? selected.routes.bus : null) ?? selected.routes.transit
        route?.steps?.forEach((step) => step.coords?.forEach(([lat, lng]) => points.push([LNG_TO_SVG(lng), LAT_TO_SVG(lat)])))
        const route2 = (selectedRouteType === 'bus' ? selected.routes2?.bus : null) ?? selected.routes2?.transit
        route2?.steps?.forEach((step) => step.coords?.forEach(([lat, lng]) => points.push([LNG_TO_SVG(lng), LAT_TO_SVG(lat)])))
      }
      setViewMode('gu')
      setSelGu(null)
      setSelDong(null)
      zoomTo(points.length >= 2 ? fitPoints(points) : FULL_VIEWBOX)
    }
  }, [selectedCandidateId, selectedRouteType]) // eslint-disable-line react-hooks/exhaustive-deps

  function drillTo(g: GuData) {
    setViewMode('dong')
    setSelGu(g)
    setSelDong(null)
    setHoveredGu(null)
    zoomTo(aspectFit(g.bbox), 620)
  }

  function goBack() {
    setViewMode('gu')
    setSelGu(null)
    setSelDong(null)
    zoomTo(FULL_VIEWBOX, 560)
  }

  function confirmSelection() {
    if (!selDong || !selGu) return
    const lat = SVG_TO_LAT(selDong.cy)
    const lng = SVG_TO_LNG(selDong.cx)
    onDistrictClick(`${selGu.name} ${selDong.name}`, lat, lng)
    goBack()
  }

  if (!guData) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#f4f6fa]">
        <div className="text-gray-400 text-sm">지도 불러오는 중...</div>
      </div>
    )
  }

  const isGu = viewMode === 'gu'
  const dongs = isGu ? [] : (dongData?.dong.filter((d) => d.gu === selGu?.code) ?? [])

  // 표시할 경로선: 토글된 모든 후보지의 steps 합산
  const allRouteSegments = candidates.flatMap((c, i) => {
    if (!routeVisible.has(c.id)) return []
    const color = CANDIDATE_COLORS[i % CANDIDATE_COLORS.length]
    const route = (selectedRouteType === 'bus' ? c.routes.bus : null) ?? c.routes.transit
    const steps = route?.steps?.filter((s) => s.coords && s.coords.length >= 2) ?? []
    const segs = steps.map((s) => ({ ...s, candidateId: c.id, candidateColor: color, isDest2: false }))
    // 보조 목적지 경로도 함께 표시 (점선으로 구분)
    if (destination2) {
      const route2 = (selectedRouteType === 'bus' ? c.routes2?.bus : null) ?? c.routes2?.transit
      const steps2 = route2?.steps?.filter((s) => s.coords && s.coords.length >= 2) ?? []
      segs.push(...steps2.map((s) => ({ ...s, candidateId: c.id, candidateColor: color, isDest2: true })))
    }
    return segs
  })

  // 경로 오버레이: 승차·환승·하차역 마커 + 총 소요시간 칩 (경로당 1개)
  type RouteOverlay = {
    candidateId: string
    color: string
    duration: number
    mid: [number, number]
    stops: { x: number; y: number; name?: string }[]
  }
  const routeOverlays: RouteOverlay[] = candidates.flatMap((c, i) => {
    if (!routeVisible.has(c.id)) return []
    const color = CANDIDATE_COLORS[i % CANDIDATE_COLORS.length]
    const make = (route: RouteResult | null | undefined): RouteOverlay[] => {
      const steps = route?.steps?.filter((s) => s.coords && s.coords.length >= 2) ?? []
      if (!steps.length) return []
      // 승차/환승 지점 = 각 대중교통 구간의 시작점, 하차 지점 = 마지막 대중교통 구간의 끝점
      const transit = steps.filter((s) => s.type !== 'walk')
      const stops = transit.map((s) => {
        const [lat, lng] = s.coords![0]
        return { x: LNG_TO_SVG(lng), y: LAT_TO_SVG(lat), name: s.from }
      })
      if (transit.length) {
        const last = transit[transit.length - 1]
        const [lat, lng] = last.coords![last.coords!.length - 1]
        stops.push({ x: LNG_TO_SVG(lng), y: LAT_TO_SVG(lat), name: last.to })
      }
      const all = steps.flatMap((s) => s.coords!)
      const [mLat, mLng] = all[Math.floor(all.length / 2)]
      return [{ candidateId: c.id, color, duration: route!.duration, mid: [LNG_TO_SVG(mLng), LAT_TO_SVG(mLat)], stops }]
    }
    const out = make((selectedRouteType === 'bus' ? c.routes.bus : null) ?? c.routes.transit)
    if (destination2) out.push(...make((selectedRouteType === 'bus' ? c.routes2?.bus : null) ?? c.routes2?.transit))
    return out
  })

  // Destination district info
  const destGu = destination ? extractGuName(destination.name) ?? destination.name : null
  const dest2Gu = destination2 ? extractGuName(destination2.name) ?? destination2.name : null

  // Candidate district info
  const candGus = candidates.map((c) => extractGuName(c.name) ?? c.name)

  // Build pins for current view
  type Pin = { cx: number; cy: number; color: string; glyph: string; dimmed: boolean }
  const pins: Pin[] = []

  if (isGu && guData) {
    // 구 뷰: 서울은 구 centroid에, 근교(구 매칭 실패)는 실좌표로 핀 표시
    if (destination) {
      const g = guData.districts.find((d) => d.name === destGu)
      const cx = g ? g.cx : LNG_TO_SVG(destination.lng)
      const cy = g ? g.cy : LAT_TO_SVG(destination.lat)
      pins.push({ cx, cy, color: '#ef4444', glyph: '★', dimmed: false })
    }
    if (destination2) {
      const g = guData.districts.find((d) => d.name === dest2Gu)
      const cx = g ? g.cx : LNG_TO_SVG(destination2.lng)
      const cy = g ? g.cy : LAT_TO_SVG(destination2.lat)
      pins.push({ cx, cy, color: '#0d9488', glyph: '★', dimmed: false })
    }
    candidates.forEach((c, i) => {
      const g = guData.districts.find((d) => d.name === candGus[i])
      const cx = g ? g.cx : LNG_TO_SVG(c.lng)
      const cy = g ? g.cy : LAT_TO_SVG(c.lat)
      const dimmed = selectedCandidateId !== null && selectedCandidateId !== c.id
      pins.push({ cx, cy, color: CANDIDATE_COLORS[i % CANDIDATE_COLORS.length], glyph: c.label, dimmed })
    })
  } else if (!isGu && selGu) {
    // 동 뷰: lat/lng → SVG 좌표로 직접 변환
    if (destination && destGu === selGu.name) {
      const sx = LNG_TO_SVG(destination.lng)
      const sy = LAT_TO_SVG(destination.lat)
      pins.push({ cx: sx, cy: sy, color: '#ef4444', glyph: '★', dimmed: false })
    }
    if (destination2 && dest2Gu === selGu.name) {
      const sx = LNG_TO_SVG(destination2.lng)
      const sy = LAT_TO_SVG(destination2.lat)
      pins.push({ cx: sx, cy: sy, color: '#0d9488', glyph: '★', dimmed: false })
    }
    candidates.forEach((c, i) => {
      if (candGus[i] !== selGu.name) return
      const sx = LNG_TO_SVG(c.lng)
      const sy = LAT_TO_SVG(c.lat)
      const dimmed = selectedCandidateId !== null && selectedCandidateId !== c.id
      pins.push({ cx: sx, cy: sy, color: CANDIDATE_COLORS[i % CANDIDATE_COLORS.length], glyph: c.label, dimmed })
    })
  }

  const guFill = (d: GuData) => {
    if (destination && d.name === destGu) return '#ef4444'
    const ci = candGus.indexOf(d.name)
    if (ci >= 0) return CANDIDATE_COLORS[ci % CANDIDATE_COLORS.length]
    return '#c7d4ec'
  }

  const guOpacity = (d: GuData) => {
    const isSelected = d.name === destGu || candGus.includes(d.name)
    if (isSelected) return 0.82
    if (hoveredGu === d.name) return 0.85
    return 1
  }

  const dongFill = (d: DongData) => (d.code === selDong?.code ? '#4f6ef2' : '#dbe2ee')
  const dongStroke = (d: DongData) => (d.code === selDong?.code ? '#3a55d9' : '#ffffff')
  const dongStrokeW = (d: DongData) => (d.code === selDong?.code ? 1.8 : 1.1)

  // viewBox 너비 기준 스케일 — 구 뷰(1000)에서 1, 동 뷰 줌인 시 비례 축소
  const mapScale = viewBox[2] / 1000

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: '#f4f6fa', fontFamily: 'Pretendard, system-ui, sans-serif' }}>
      {/* SVG Map */}
      <svg
        ref={svgRef}
        viewBox={viewBox.join(' ')}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* 수도권 배경 (인천·경기) — 컨텍스트용, 비클릭 */}
        {isGu &&
          METRO.map((m) => (
            <path
              key={m.code}
              d={m.d}
              fill="#e4e7ec"
              stroke="#eef1f5"
              strokeWidth={1.4 * mapScale}
              strokeLinejoin="round"
              opacity={0.85}
              style={{ pointerEvents: 'none' }}
            />
          ))}
        {/* 수도권 지역명 라벨 (시 단위, 중복 제거) */}
        {isGu &&
          Object.values(
            METRO.reduce((acc, m) => {
              (acc[m.label] = acc[m.label] || []).push(m)
              return acc
            }, {} as Record<string, typeof METRO>),
          ).map((group) => {
            const cx = group.reduce((s, g) => s + g.cx, 0) / group.length
            const cy = group.reduce((s, g) => s + g.cy, 0) / group.length
            return (
              <text
                key={group[0].label}
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={9 * mapScale}
                fontWeight={500}
                fill="#9aa3b0"
                letterSpacing="-0.3"
                style={{ pointerEvents: 'none' }}
              >
                {group[0].label}
              </text>
            )
          })}

        {/* Backdrop in dong view */}
        {!isGu &&
          guData.districts.map((d) => (
            <path key={d.code} d={d.d} fill="#eaeef5" stroke="#ffffff" strokeWidth={1} strokeLinejoin="round" />
          ))}

        {/* Anti-alias underlay: 같은 색 stroke를 먼저 깔아 경계의 미세 공백을 메움 */}
        {isGu
          ? guData.districts.map((d) => (
              <path
                key={`${d.code}-underlay`}
                d={d.d}
                fill={guFill(d)}
                stroke={guFill(d)}
                strokeWidth={2.4 * mapScale}
                strokeLinejoin="round"
                opacity={guOpacity(d)}
                style={{ pointerEvents: 'none' }}
              />
            ))
          : dongs.map((d) => (
              <path
                key={`${d.code}-underlay`}
                d={d.d}
                fill={dongFill(d)}
                stroke={dongFill(d)}
                strokeWidth={2.2}
                strokeLinejoin="round"
                style={{ pointerEvents: 'none' }}
              />
            ))}

        {/* District / dong shapes */}
        {isGu
          ? guData.districts.map((d) => (
              <path
                key={d.code}
                d={d.d}
                fill={guFill(d)}
                stroke="rgba(255,255,255,0.78)"
                strokeWidth={0.75 * mapScale}
                strokeLinejoin="round"
                opacity={guOpacity(d)}
                style={{ cursor: 'pointer' }}
                onClick={() => { if (!ignoreTapAfterGesture()) drillTo(d) }}
                onMouseEnter={() => setHoveredGu(d.name)}
                onMouseLeave={() => setHoveredGu(null)}
              />
            ))
          : dongs.map((d) => (
              <path
                key={d.code}
                d={d.d}
                fill={dongFill(d)}
                stroke={dongStroke(d)}
                strokeWidth={dongStrokeW(d) * 0.72}
                strokeLinejoin="round"
                style={{ cursor: 'pointer' }}
                onClick={() => { if (!ignoreTapAfterGesture()) setSelDong(d) }}
              />
            ))}

        {/* 한강 — OSM 실제 물길 폴리곤 (채움) */}
        {isGu &&
          guData.river?.map((rd, i) => (
            <path
              key={i}
              d={rd}
              fill="#a8cfe8"
              fillRule="evenodd"
              stroke="#8ab8d8"
              strokeWidth={0.8 * mapScale}
              strokeLinejoin="round"
              style={{ pointerEvents: 'none' }}
            />
          ))}

        {/* 지하철 노선도 */}
        {SUBWAY_LINES.filter((l) => visibleLines.has(l.id)).map((line) =>
          line.stations.map((segment, si) => {
            const pts = segment
              .map((st) => `${LNG_TO_SVG(st.lng).toFixed(1)},${LAT_TO_SVG(st.lat).toFixed(1)}`)
              .join(' L ')
            return (
              <g key={`${line.id}-${si}-path`} style={{ pointerEvents: 'none' }}>
                <path d={`M ${pts}`} fill="none" stroke="#fff" strokeWidth={5 * mapScale} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
                <path d={`M ${pts}`} fill="none" stroke={line.color} strokeWidth={3.5 * mapScale} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
              </g>
            )
          })
        )}

        {/* 지하철 역명 마커 */}
        {SUBWAY_LINES.filter((l) => visibleLines.has(l.id)).map((line) =>
          line.stations.map((segment, si) =>
            segment.map((st, stIdx) => {
              const sx = LNG_TO_SVG(st.lng)
              const sy = LAT_TO_SVG(st.lat)
              const stR = 2.8 * mapScale
              const fs = 6.5 * mapScale
              return (
                <g key={`${line.id}-${si}-${stIdx}`} style={{ pointerEvents: 'none' }}>
                  <circle cx={sx} cy={sy} r={stR + 1.5 * mapScale} fill="#fff" />
                  <circle cx={sx} cy={sy} r={stR} fill={line.color} />
                  <text
                    x={sx}
                    y={sy - (stR + 2.5 * mapScale)}
                    textAnchor="middle"
                    fontSize={fs}
                    fontWeight={700}
                    fill="#222"
                    stroke="#fff"
                    strokeWidth={2 * mapScale}
                    paintOrder="stroke"
                    letterSpacing="-0.2"
                  >
                    {st.name}
                  </text>
                </g>
              )
            })
          )
        )}

        {/* 경로선 — 토글된 모든 후보지 */}
        {allRouteSegments.map((seg, i) => {
          const pts = seg.coords!
            .map(([lat, lng]) => `${LNG_TO_SVG(lng).toFixed(1)},${LAT_TO_SVG(lat).toFixed(1)}`)
            .join(' L ')
          const isWalk = seg.type === 'walk'
          const isBus = seg.type === 'bus'
          const dimmed = selectedCandidateId !== null && selectedCandidateId !== seg.candidateId
          // 노선색(seg.color) 대신 후보지 색으로 통일 — 카드/핀과 매칭되고, 연한 노선색이 배경에 묻히지 않음
          const lineColor = isWalk ? '#6b7280' : seg.candidateColor
          const lw = mapScale * (isWalk ? 4.5 : isBus ? 7 : 8)
          // 이동수단별 선 패턴: 지하철=실선, 버스=점(dot), 도보=짧은 점선. 보조 목적지(B)는 긴 점선(버스면 dot 우선)
          const dash = isWalk
            ? `${8 * mapScale},${7 * mapScale}`
            : isBus
              ? `0.1,${lw * 1.9}`
              : (seg.isDest2 ? `${11 * mapScale},${7 * mapScale}` : undefined)
          // 대중교통 구간 중앙에 수단 배지(🚇/🚌) — 짧은 구간은 생략
          let badge: { x: number; y: number } | null = null
          if (!isWalk && seg.coords!.length >= 2) {
            const [aLat, aLng] = seg.coords![0]
            const [bLat, bLng] = seg.coords![seg.coords!.length - 1]
            const spanX = LNG_TO_SVG(bLng) - LNG_TO_SVG(aLng)
            const spanY = LAT_TO_SVG(bLat) - LAT_TO_SVG(aLat)
            if (Math.hypot(spanX, spanY) > 55 * mapScale) {
              const [mLat, mLng] = seg.coords![Math.floor(seg.coords!.length / 2)]
              badge = { x: LNG_TO_SVG(mLng), y: LAT_TO_SVG(mLat) }
            }
          }
          const badgeR = 10 * mapScale
          return (
            <g key={i} style={{ pointerEvents: 'none' }} opacity={dimmed ? 0.25 : 1}>
              {/* 흰 halo — 지도와 분리 (dash 패턴 동일 적용해 정렬 유지) */}
              <path d={`M ${pts}`} fill="none" stroke="#fff" strokeWidth={lw * 2} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
              {/* 어두운 외곽 캐싱 — 밝은 배경/같은 색 구 위에서도 대비 확보 */}
              {!isWalk && (
                <path d={`M ${pts}`} fill="none" stroke={darken(seg.candidateColor)} strokeWidth={lw * 1.4} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" />
              )}
              <path
                d={`M ${pts}`}
                fill="none"
                stroke={lineColor}
                strokeWidth={lw}
                strokeDasharray={dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isWalk ? 0.9 : 1}
              />
              {badge && (
                <g transform={`translate(${badge.x.toFixed(1)},${badge.y.toFixed(1)})`}>
                  <circle r={badgeR} fill="#fff" stroke={seg.candidateColor} strokeWidth={2 * mapScale} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={11 * mapScale}>
                    {isBus ? '🚌' : '🚇'}
                  </text>
                </g>
              )}
            </g>
          )
        })}

        {/* 경로 오버레이 — 승차·환승·하차역 마커 + 소요시간 칩 */}
        {routeOverlays.map((o, i) => {
          const dimmed = selectedCandidateId !== null && selectedCandidateId !== o.candidateId
          const label = `${o.duration}분`
          const chipH = 16 * mapScale
          const chipW = label.length * 6.5 * mapScale + 12 * mapScale
          return (
            <g key={`route-overlay-${i}`} style={{ pointerEvents: 'none' }} opacity={dimmed ? 0.25 : 1}>
              {o.stops.map((st, k) => (
                <g key={k}>
                  <circle cx={st.x} cy={st.y} r={4.5 * mapScale} fill="#fff" stroke={darken(o.color)} strokeWidth={2.2 * mapScale} />
                  {st.name && (
                    <text
                      x={st.x}
                      y={st.y - 8 * mapScale}
                      textAnchor="middle"
                      fontSize={7.5 * mapScale}
                      fontWeight={700}
                      fill="#1f2937"
                      stroke="#fff"
                      strokeWidth={2.5 * mapScale}
                      paintOrder="stroke"
                      letterSpacing="-0.2"
                    >
                      {st.name}
                    </text>
                  )}
                </g>
              ))}
              {/* 소요시간 칩 — 경로선 위쪽에 띄워 배지와 겹침 방지 */}
              <g transform={`translate(${o.mid[0].toFixed(1)},${(o.mid[1] - 18 * mapScale).toFixed(1)})`}>
                <rect x={-chipW / 2} y={-chipH / 2} width={chipW} height={chipH} rx={chipH / 2} fill={o.color} stroke="#fff" strokeWidth={1.8 * mapScale} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={9.5 * mapScale} fontWeight={800} fill="#fff">
                  {label}
                </text>
              </g>
            </g>
          )
        })}

        {/* 편의시설 마커 — mapScale로 줌 레벨에 따라 크기 조정 */}
        {nearbyPlaces.map((place) => {
          const x = LNG_TO_SVG(place.lng)
          const y = LAT_TO_SVG(place.lat)
          // 수도권(통근권) 좌표 범위 밖만 컬링 — 예전 서울 전용 범위(1050×850)는 분당·하남 등 근교 마커를 잘라냈음
          if (x < -700 || x > 1550 || y < -350 || y > 1300) return null
          const cfg = place.category === 'CUSTOM'
            ? { color: '#6b7280', emoji: '📍' }
            : PLACE_CATEGORIES[place.category as keyof typeof PLACE_CATEGORIES]
          const pr = 13 * mapScale
          return (
            <g key={place.id} transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`} style={{ pointerEvents: 'none' }}>
              <circle r={pr} fill={cfg.color} stroke="#fff" strokeWidth={2 * mapScale} opacity={0.92} />
              <text textAnchor="middle" dominantBaseline="middle" fontSize={pr} opacity={1}>
                {cfg.emoji}
              </text>
            </g>
          )
        })}

        {/* 구 outline in dong view */}
        {!isGu && selGu && (
          <path
            d={selGu.d}
            fill="none"
            stroke="#4f6ef2"
            strokeWidth={2.4}
            strokeLinejoin="round"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Labels */}
        <g style={{ pointerEvents: 'none' }}>
          {isGu
            ? guData.districts.map((d) => {
                const hasPin = pins.some((p) => Math.abs(p.cx - d.cx) < 5)
                if (hasPin) return null
                const isSelected = d.name === destGu || candGus.includes(d.name)
                return (
                  <text
                    key={d.code}
                    x={d.cx}
                    y={d.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill={isSelected ? '#fff' : '#5c6573'}
                    letterSpacing="-0.3"
                  >
                    {d.name}
                  </text>
                )
              })
            : dongs.map((d) => {
                const isSel = d.code === selDong?.code
                return (
                  <text
                    key={d.code}
                    x={d.cx}
                    y={d.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={isSel ? 13 : 9}
                    fontWeight={isSel ? 800 : 600}
                    fill={isSel ? '#ffffff' : '#5c6573'}
                    letterSpacing="-0.3"
                    style={{ pointerEvents: 'none' }}
                  >
                    {d.name}
                  </text>
                )
              })}
        </g>

        {/* Pins — mapScale로 줌 레벨에 맞게 크기 조정 */}
        {pins.map((p, i) => {
          const r = 14 * mapScale
          const tailH = 9 * mapScale
          const sw = 2.5 * mapScale
          return (
            <g
              key={i}
              transform={`translate(${p.cx}, ${p.cy})`}
              opacity={p.dimmed ? 0.45 : 1}
              style={{ pointerEvents: 'none' }}
            >
              <circle cx={0} cy={-(r + tailH)} r={r} fill={p.color} stroke="#ffffff" strokeWidth={sw} />
              <text
                x={0}
                y={-(r + tailH)}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={(p.glyph === '★' ? 12 : 13) * mapScale}
                fontWeight={800}
                fill="#ffffff"
              >
                {p.glyph}
              </text>
              <polygon
                points={`0,0 ${-6 * mapScale},${-tailH} ${6 * mapScale},${-tailH}`}
                fill={p.color}
              />
            </g>
          )
        })}
      </svg>

      {/* Top overlay */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 pointer-events-none">
        {!isGu ? (
          <>
            <button
              className="flex items-center gap-1.5 bg-white text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-md hover:bg-gray-50 transition-colors pointer-events-auto"
              onClick={goBack}
            >
              ← 서울 전체
            </button>
            <span className="text-sm font-bold text-gray-800 bg-white/95 px-3 py-1.5 rounded-full shadow-sm">
              {selGu?.name}
            </span>
          </>
        ) : (
          <span className="text-xs text-gray-500 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm">
            서울특별시 자치구
          </span>
        )}
      </div>

      {/* Legend + 경로 토글 (구 view only) */}
      {isGu && (destination || candidates.length > 0) && (
        <div className="absolute top-3 right-3 z-10 bg-white/95 backdrop-blur-sm rounded-xl shadow-sm px-3 py-2 flex flex-col gap-1.5">
          {destination && (
            <div className="flex items-center gap-2 pointer-events-none">
              <span className="w-3 h-3 rounded-full bg-red-500 flex items-center justify-center text-white text-[7px] shrink-0">★</span>
              <span className="text-[11px] text-gray-600 truncate max-w-[80px]">{destGu ?? destination.name}</span>
            </div>
          )}
          {destination2 && (
            <div className="flex items-center gap-2 pointer-events-none">
              <span className="w-3 h-3 rounded-full flex items-center justify-center text-white text-[7px] shrink-0" style={{ background: '#0d9488' }}>★</span>
              <span className="text-[11px] text-gray-600 truncate max-w-[80px]">{dest2Gu ?? destination2.name}</span>
            </div>
          )}
          {candidates.map((c, i) => {
            const color = CANDIDATE_COLORS[i % CANDIDATE_COLORS.length]
            const hasRoute = !!(c.routes.transit?.steps?.length)
            const visible = routeVisible.has(c.id)
            return (
              <div key={c.id} className="flex items-center gap-2">
                <button
                  onClick={() => hasRoute && toggleRoute(c.id)}
                  title={hasRoute ? (visible ? '경로 숨기기' : '경로 표시') : '경로 없음'}
                  className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold transition-all"
                  style={{
                    background: color,
                    opacity: hasRoute ? 1 : 0.4,
                    outline: visible && hasRoute ? `2px solid ${color}` : '2px solid transparent',
                    outlineOffset: '1px',
                  }}
                >
                  {visible && hasRoute ? c.label : <span style={{ opacity: 0.7 }}>{c.label}</span>}
                </button>
                <span className="text-[11px] text-gray-600 truncate max-w-[80px]">{candGus[i] ?? c.name}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* 지하철 노선 토글 버튼 — 왼쪽 세로 컬럼 */}
      {(
        <div className="absolute left-3 top-14 z-10 flex flex-col gap-1 bg-white/90 backdrop-blur-sm rounded-xl px-2 py-2 shadow-sm max-h-[calc(100%-120px)] overflow-y-auto scrollbar-none">
          <button
            onClick={toggleAllLines}
            className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold text-left transition-all whitespace-nowrap"
            style={{
              background: allLinesVisible ? '#111827' : '#f3f4f6',
              color: allLinesVisible ? '#fff' : '#4b5563',
            }}
          >
            전체
          </button>
          <div className="h-px bg-gray-100 my-0.5" />
          {SUBWAY_LINES.map((line) => {
            const on = visibleLines.has(line.id)
            return (
              <button
                key={line.id}
                onClick={() => toggleLine(line.id)}
                className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold text-left transition-all whitespace-nowrap"
                style={{
                  background: on ? line.color : 'transparent',
                  color: on ? '#fff' : '#6b7280',
                }}
              >
                {line.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute right-3 bottom-24 z-10 flex flex-col overflow-hidden rounded-xl bg-white/95 shadow-md border border-gray-100">
        <button
          onClick={() => zoomBy(0.72)}
          className="w-10 h-10 flex items-center justify-center text-lg font-bold text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          title="확대"
        >
          +
        </button>
        <div className="h-px bg-gray-100" />
        <button
          onClick={() => zoomBy(1.35)}
          className="w-10 h-10 flex items-center justify-center text-lg font-bold text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          title="축소"
        >
          -
        </button>
        <div className="h-px bg-gray-100" />
        <button
          onClick={() => {
            setViewMode('gu')
            setSelGu(null)
            setSelDong(null)
            zoomTo(FULL_VIEWBOX, 360)
          }}
          className="w-10 h-9 flex items-center justify-center text-[11px] font-bold text-gray-500 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          title="전체 보기"
        >
          전체
        </button>
      </div>

      {/* Bottom: hint or dong confirmation sheet */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        {isGu ? (
          <div className="flex justify-center pb-5 pointer-events-none">
            <div
              className={`text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg whitespace-nowrap ${
                mode === 'set-destination' ? 'bg-red-500' : 'bg-blue-500'
              }`}
            >
              {mode === 'set-destination'
                ? '구를 탭해 동 선택 → 목적지 설정'
                : '구를 탭해 동 선택 → 후보지 추가'}
            </div>
          </div>
        ) : (
          <div className="bg-white border-t border-gray-100 px-5 py-4 rounded-t-2xl shadow-[0_-4px_24px_rgba(20,28,46,.10)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-gray-400 font-semibold mb-1 tracking-tight">
                  {selDong ? `${selGu?.name} · 선택된 동` : '동을 선택하세요'}
                </div>
                <div
                  className="text-xl font-extrabold truncate tracking-tight"
                  style={{ color: selDong ? '#171c26' : '#9aa3b0' }}
                >
                  {selDong ? selDong.name : selGu?.name}
                </div>
              </div>
              <button
                onClick={confirmSelection}
                disabled={!selDong}
                className="shrink-0 px-6 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-35 active:scale-95"
                style={{ background: '#4f6ef2', color: '#ffffff' }}
              >
                {mode === 'set-destination' ? '목적지로 설정' : '후보지 추가'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
