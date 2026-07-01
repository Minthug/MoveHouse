import { useEffect, useRef, useState, useCallback } from 'react'
import type { AppMode, CandidateLocation, Destination } from '../types'
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
const GU_NAMES = [
  '강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구',
  '노원구','도봉구','동대문구','동작구','마포구','서대문구','서초구','성동구',
  '성북구','송파구','양천구','영등포구','용산구','은평구','종로구','중구','중랑구',
]

function extractGuName(address: string): string | null {
  return GU_NAMES.find((g) => address.includes(g)) ?? null
}

function extractDongName(address: string): string | null {
  const m = address.match(/([가-힣]+(?:동|가|로|읍|면))/)
  return m?.[1] ?? null
}

function aspectFit(bbox: [number, number, number, number]): [number, number, number, number] {
  let [x, y, w, h] = bbox
  const px = w * 0.18, py = h * 0.18
  x -= px; y -= py; w += px * 2; h += py * 2
  const A = 1000 / 800
  if (w / h < A) { const nw = h * A; x -= (nw - w) / 2; w = nw }
  else { const nh = w / A; y -= (nh - h) / 2; h = nh }
  return [x, y, w, h]
}

const EASE = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

interface Props {
  mode: AppMode
  destination: Destination | null
  candidates: CandidateLocation[]
  selectedCandidateId: string | null
  selectedRouteType: 'transit' | 'bus'
  nearbyPlaces: NearbyPlace[]
  onDistrictClick: (name: string, lat: number, lng: number) => void
}

export default function SeoulMap({ mode, destination, candidates, selectedCandidateId, selectedRouteType, nearbyPlaces, onDistrictClick }: Props) {
  const [guData, setGuData] = useState<SeoulData | null>(null)
  const [dongData, setDongData] = useState<DongSeoulData | null>(null)
  const [viewMode, setViewMode] = useState<'gu' | 'dong'>('gu')
  const [selGu, setSelGu] = useState<GuData | null>(null)
  const [selDong, setSelDong] = useState<DongData | null>(null)
  const [hoveredGu, setHoveredGu] = useState<string | null>(null)
  const [viewBox, setViewBox] = useState<[number, number, number, number]>([-468, -323, 1999, 1599])
  const vbRef = useRef<[number, number, number, number]>([-468, -323, 1999, 1599])
  const rafRef = useRef(0)

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

  function zoomTo(target: [number, number, number, number]) {
    cancelAnimationFrame(rafRef.current)
    const start = vbRef.current.slice() as [number, number, number, number]
    const t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 420)
      const e = EASE(p)
      const cur = start.map((s, i) => s + (target[i] - s) * e) as [number, number, number, number]
      vbRef.current = cur
      setViewBox(cur)
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
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
      setViewMode('gu')
      setSelGu(null)
      setSelDong(null)
      zoomTo([-468, -323, 1999, 1599])
    }
  }, [selectedCandidateId]) // eslint-disable-line react-hooks/exhaustive-deps

  function drillTo(g: GuData) {
    setViewMode('dong')
    setSelGu(g)
    setSelDong(null)
    setHoveredGu(null)
    zoomTo(aspectFit(g.bbox))
  }

  function goBack() {
    setViewMode('gu')
    setSelGu(null)
    setSelDong(null)
    zoomTo([-468, -323, 1999, 1599])
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
    const route = (selectedRouteType === 'bus' ? c.routes.bus : null) ?? c.routes.transit
    const steps = route?.steps?.filter((s) => s.coords && s.coords.length >= 2) ?? []
    return steps.map((s) => ({
      ...s,
      candidateId: c.id,
      candidateColor: CANDIDATE_COLORS[i % CANDIDATE_COLORS.length],
    }))
  })

  // Destination district info
  const destGu = destination ? extractGuName(destination.name) ?? destination.name : null
  const destDong = destination ? extractDongName(destination.name) : null

  // Candidate district info
  const candGus = candidates.map((c) => extractGuName(c.name) ?? c.name)
  const candDongs = candidates.map((c) => extractDongName(c.name))

  // Build pins for current view
  type Pin = { cx: number; cy: number; color: string; glyph: string; dimmed: boolean }
  const pins: Pin[] = []

  if (isGu && guData) {
    // 구 뷰: 구 centroid에 핀 표시 (offset 없이 — 렌더링에서 mapScale로 처리)
    if (destination) {
      const g = guData.districts.find((d) => d.name === destGu)
      if (g) pins.push({ cx: g.cx, cy: g.cy, color: '#ef4444', glyph: '★', dimmed: false })
    }
    candidates.forEach((c, i) => {
      const g = guData.districts.find((d) => d.name === candGus[i])
      if (g) {
        const dimmed = selectedCandidateId !== null && selectedCandidateId !== c.id
        pins.push({ cx: g.cx, cy: g.cy, color: CANDIDATE_COLORS[i % CANDIDATE_COLORS.length], glyph: c.label, dimmed })
      }
    })
  } else if (!isGu && selGu) {
    // 동 뷰: lat/lng → SVG 좌표로 직접 변환
    if (destination && destGu === selGu.name) {
      const sx = LNG_TO_SVG(destination.lng)
      const sy = LAT_TO_SVG(destination.lat)
      pins.push({ cx: sx, cy: sy, color: '#ef4444', glyph: '★', dimmed: false })
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
        viewBox={viewBox.join(' ')}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block' }}
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

        {/* District / dong shapes */}
        {isGu
          ? guData.districts.map((d) => (
              <path
                key={d.code}
                d={d.d}
                fill={guFill(d)}
                stroke="#ffffff"
                strokeWidth={1.2 * mapScale}
                strokeLinejoin="round"
                opacity={guOpacity(d)}
                style={{ cursor: 'pointer' }}
                onClick={() => drillTo(d)}
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
                strokeWidth={dongStrokeW(d)}
                strokeLinejoin="round"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelDong(d)}
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
          const dimmed = selectedCandidateId !== null && selectedCandidateId !== seg.candidateId
          const lineColor = isWalk ? '#9ca3af' : (seg.color ?? seg.candidateColor)
          const lw = mapScale * (isWalk ? 4 : 7)
          return (
            <g key={i} style={{ pointerEvents: 'none' }} opacity={dimmed ? 0.25 : 1}>
              {!isWalk && (
                <path d={`M ${pts}`} fill="none" stroke="#fff" strokeWidth={lw * 1.8} strokeLinecap="round" strokeLinejoin="round" />
              )}
              <path
                d={`M ${pts}`}
                fill="none"
                stroke={lineColor}
                strokeWidth={lw}
                strokeDasharray={isWalk ? `${8 * mapScale},${7 * mapScale}` : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isWalk ? 0.65 : 0.9}
              />
            </g>
          )
        })}

        {/* 편의시설 마커 — mapScale로 줌 레벨에 따라 크기 조정 */}
        {nearbyPlaces.map((place) => {
          const x = LNG_TO_SVG(place.lng)
          const y = LAT_TO_SVG(place.lat)
          if (x < -50 || x > 1050 || y < -50 || y > 850) return null
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
