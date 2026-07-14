import { useState, useRef } from 'react'
import Linkify from './Linkify'
import { calcMonthlyFare } from '../services/directions'
import type { CandidateLocation, RouteResult, RouteStep } from '../types'

const CANDIDATE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899']

const SUBWAY_LINE_COLORS: Record<string, string> = {
  '수도권 1호선': '#0052A4', '수도권 2호선': '#00A84D', '수도권 3호선': '#EF7C1C',
  '수도권 4호선': '#00A5DE', '수도권 5호선': '#996CAC', '수도권 6호선': '#CD7C2F',
  '수도권 7호선': '#747F00', '수도권 8호선': '#E6186C', '수도권 9호선': '#BDB092',
  '수도권 신분당선': '#D31145', '공항철도': '#0090D2',
}

function lineColor(name?: string) {
  if (!name) return '#6b7280'
  for (const [k, v] of Object.entries(SUBWAY_LINE_COLORS)) {
    if (name.includes(k.replace('수도권 ', ''))) return v
  }
  return '#6b7280'
}

function shortLineName(name?: string) {
  if (!name) return '지하철'
  return name.replace('수도권 ', '').replace('호선', '호선')
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}분`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`
}

function formatFare(fare: number): string {
  return fare.toLocaleString('ko-KR') + '원'
}

function routeMode(route?: RouteResult) {
  const steps = route?.steps ?? []
  const hasSubway = steps.some((s) => s.type === 'subway')
  const hasBus = steps.some((s) => s.type === 'bus')
  if (hasSubway && hasBus) return { icon: '🚇🚌', label: '최적 경로' }
  if (hasBus) return { icon: '🚌', label: '버스 경로' }
  if (hasSubway) return { icon: '🚇', label: '지하철 경로' }
  return { icon: '🚶', label: '도보 경로' }
}

function RouteSteps({ steps }: { steps: RouteStep[] }) {
  const significant = steps.filter((s) => s.type !== 'walk' || s.duration >= 5)

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1">
      {steps.map((step, i) => {
        if (step.type === 'walk') {
          if (step.duration < 3) return null
          return (
            <span key={i} className="text-xs text-gray-400 flex items-center gap-0.5">
              {i > 0 && <span className="text-gray-300 mx-0.5">›</span>}
              🚶{step.duration}분
            </span>
          )
        }
        if (step.type === 'subway') {
          const color = lineColor(step.name)
          return (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <span className="text-gray-300 mx-0.5">›</span>}
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full text-white"
                style={{ background: color }}
              >
                🚇 {shortLineName(step.name)}
              </span>
              <span className="text-xs text-gray-400">{step.duration}분</span>
            </span>
          )
        }
        if (step.type === 'bus') {
          return (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <span className="text-gray-300 mx-0.5">›</span>}
              <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full text-white bg-green-500">
                🚌 {step.name}번
              </span>
              <span className="text-xs text-gray-400">{step.duration}분</span>
            </span>
          )
        }
        return null
      })}
      {significant.length === 0 && (
        <span className="text-xs text-gray-400">도보만으로 이동 가능</span>
      )}
    </div>
  )
}

function RouteDetailCard({
  icon,
  label,
  route,
  active,
  onClick,
}: {
  icon: string
  label: string
  route: RouteResult
  active: boolean
  onClick: () => void
}) {
  const monthly = calcMonthlyFare(route.fare)
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg p-3 flex items-center justify-between text-left transition-all border ${
        active
          ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
          : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <div>
          <div className="text-xs text-gray-400">{label}</div>
          <div className="text-sm font-semibold text-gray-800">{formatDuration(route.duration)}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-gray-400">편도</div>
        <div className="text-xs font-medium text-gray-600">{formatFare(route.fare)}</div>
        <div className="text-xs text-gray-400">월 {formatFare(monthly)}</div>
      </div>
    </button>
  )
}

interface Props {
  candidate: CandidateLocation
  index: number
  selected: boolean
  selectedRouteType: 'transit' | 'bus'
  hasDest2?: boolean
  onSelect: (id: string, routeType: 'transit' | 'bus') => void
  onRemove: (id: string) => void
  onMemoChange: (id: string, memo: string) => void
  onRentChange: (id: string, rent: number | undefined) => void
}

export default function LocationCard({ candidate, index, selected, selectedRouteType, hasDest2, onSelect, onRemove, onMemoChange, onRentChange }: Props) {
  const color = CANDIDATE_COLORS[index % CANDIDATE_COLORS.length]
  const [memoOpen, setMemoOpen] = useState(false)
  const [memoValue, setMemoValue] = useState(candidate.memo ?? '')
  const [rentValue, setRentValue] = useState(candidate.rent != null ? String(candidate.rent / 10000) : '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { transit, bus } = candidate.routes
  const transit2 = candidate.routes2?.transit
  const hasBus = bus != null  // null(조회완료/차이없음)과 RouteResult 구분
  const activeRoute = selected ? (selectedRouteType === 'bus' && hasBus ? bus! : transit) : transit
  const monthlyFare = activeRoute?.fare ? calcMonthlyFare(activeRoute.fare) : null
  const combined = transit && transit2 ? transit.duration + transit2.duration : null
  const transitMode = routeMode(transit)
  const transit2Mode = routeMode(transit2)

  // 실질 월 비용 = 월세 + 월 교통비(두 목적지면 합산)
  const monthlyTransit =
    (transit?.fare ? calcMonthlyFare(transit.fare) : 0) +
    (hasDest2 && transit2?.fare ? calcMonthlyFare(transit2.fare) : 0)
  const realCost = candidate.rent != null ? candidate.rent + monthlyTransit : null

  const hasRoute = !candidate.loading && !!transit

  return (
    <div className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-all ${selected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'}`}>
      {/* Header */}
      <div
        className={`flex items-center gap-2 lg:gap-3 p-3 lg:p-4 ${hasRoute ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}`}
        onClick={() => hasRoute && onSelect(candidate.id, selected ? selectedRouteType : 'transit')}
      >
        <div
          className="w-7 h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-white text-xs lg:text-sm font-bold shrink-0"
          style={{ background: color }}
        >
          {candidate.label}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 line-clamp-2 break-keep leading-snug" title={candidate.name}>
            {candidate.name}
          </p>
          {transit && !candidate.loading && !hasDest2 && (
            <div className="mt-0.5 space-y-0.5">
              <p className="text-xs text-gray-500">
                {transitMode.icon} {formatDuration(transit.duration)} · {formatFare(transit.fare)}
                {monthlyFare && transit === activeRoute && <span className="text-gray-400"> · 월 {formatFare(monthlyFare)}</span>}
              </p>
              {hasBus && (
                <p className="text-xs text-green-600">
                  🚌 버스 우선 {formatDuration(bus!.duration)} · {formatFare(bus!.fare)}
                </p>
              )}
            </div>
          )}
          {transit && !candidate.loading && hasDest2 && (
            <div className="mt-1 space-y-0.5">
              <p className="text-xs text-gray-600 flex items-center gap-1">
                <span style={{ color: '#ef4444' }}>★</span>
                {transitMode.icon} {formatDuration(transit.duration)} · {formatFare(transit.fare)}
              </p>
              {candidate.loading2 ? (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <span style={{ color: '#0d9488' }}>★</span> 계산 중…
                </p>
              ) : transit2 ? (
                <p className="text-xs text-gray-600 flex items-center gap-1">
                  <span style={{ color: '#0d9488' }}>★</span>
                  {formatDuration(transit2.duration)} · {formatFare(transit2.fare)}
                </p>
              ) : candidate.error2 ? (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <span style={{ color: '#0d9488' }}>★</span> 경로 없음
                </p>
              ) : null}
              {combined != null && (
                <p className="text-xs font-semibold text-gray-700">합계 {formatDuration(combined)}</p>
              )}
            </div>
          )}
          {realCost != null && !candidate.loading && (
            <p className="text-xs mt-1 font-semibold" style={{ color: '#111827' }}>
              🏠 실질 월 {formatFare(realCost)}
              <span className="text-gray-400 font-normal"> (월세 {formatFare(candidate.rent!)} + 교통 {formatFare(monthlyTransit)})</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasRoute && (
            <span className="hidden sm:inline text-xs text-blue-400">{selected ? '지도 표시 중' : '클릭해서 경로 보기'}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(candidate.id) }}
            className="text-gray-300 hover:text-gray-500 text-lg leading-none transition-colors"
          >
            ×
          </button>
        </div>
      </div>

      {/* Loading */}
      {candidate.loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 px-3 lg:px-4 pb-3 lg:pb-4">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin" />
          경로 계산 중...
        </div>
      )}

      {/* Error */}
      {!candidate.loading && candidate.error && (
        <p className="text-xs text-red-400 px-3 lg:px-4 pb-3 lg:pb-4">{candidate.error}</p>
      )}

      {/* 월세 입력 (실질 비용용) */}
      <div className="px-3 lg:px-4 pt-2 pb-1 border-t border-gray-50 flex items-center gap-2">
        <span className="text-xs text-gray-400 shrink-0">🏠 월세</span>
        <input
          type="number"
          inputMode="numeric"
          value={rentValue}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setRentValue(e.target.value)}
          onBlur={() => {
            const v = parseFloat(rentValue)
            onRentChange(candidate.id, isNaN(v) || v <= 0 ? undefined : Math.round(v * 10000))
          }}
          placeholder="예: 50"
          className="w-20 text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-200 text-gray-700 placeholder-gray-300"
        />
        <span className="text-xs text-gray-400">만원</span>
      </div>

      {/* 메모 — 닫힌 상태에선 전체 표시 + URL은 클릭 가능한 링크 */}
      <div className="px-3 lg:px-4 pb-3">
        <button
          onClick={() => {
            setMemoOpen((v) => !v)
            if (!memoOpen) setTimeout(() => textareaRef.current?.focus(), 50)
          }}
          className="flex items-center gap-1.5 mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <span>📝</span>
          {memoOpen ? '메모 닫기' : (memoValue ? '메모 수정' : '메모 추가')}
        </button>
        {!memoOpen && memoValue && (
          <p className="mt-1 text-xs text-gray-500 whitespace-pre-wrap break-keep">
            <Linkify text={memoValue} />
          </p>
        )}
        {memoOpen && (
          <textarea
            ref={textareaRef}
            value={memoValue}
            onChange={(e) => setMemoValue(e.target.value)}
            onBlur={() => onMemoChange(candidate.id, memoValue)}
            placeholder="이 후보지에 대한 메모를 입력하세요 (URL은 자동으로 링크가 돼요)"
            rows={3}
            className="mt-2 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-700 placeholder-gray-300"
          />
        )}
      </div>

      {/* 상세 경로 — 선택됐을 때만 */}
      {selected && hasRoute && (
        <div className="px-3 lg:px-4 pb-3 lg:pb-4 border-t border-gray-100 pt-3 space-y-2">
          {hasDest2 && (
            <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <span style={{ color: '#ef4444' }}>★</span> 첫 번째 목적지 경로
            </p>
          )}
          <p className="text-xs text-gray-400 mb-1">경로 선택 (클릭하면 지도에 표시)</p>
          <RouteDetailCard
            icon={transitMode.icon}
            label={transitMode.label}
            route={transit!}
            active={selectedRouteType === 'transit'}
            onClick={() => onSelect(candidate.id, 'transit')}
          />
          {hasBus && (
            <RouteDetailCard
              icon="🚌"
              label="버스 우선"
              route={bus!}
              active={selectedRouteType === 'bus'}
              onClick={() => onSelect(candidate.id, 'bus')}
            />
          )}
          {(selectedRouteType === 'transit' ? transit : bus)?.steps && (
            <RouteSteps steps={(selectedRouteType === 'transit' ? transit : bus)!.steps!} />
          )}

          {/* 두 번째 목적지 경로 (지도에선 점선) */}
          {hasDest2 && transit2 && (
            <div className="pt-2 mt-1 border-t border-gray-100 space-y-1">
              <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
                <span style={{ color: '#0d9488' }}>★</span> 두 번째 목적지 경로
                <span className="text-gray-300 font-normal">· 지도에선 점선</span>
              </p>
              <p className="text-xs text-gray-500">
                {transit2Mode.icon} {formatDuration(transit2.duration)} · {formatFare(transit2.fare)}
              </p>
              {transit2.steps && <RouteSteps steps={transit2.steps} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
