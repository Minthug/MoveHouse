import { calcMonthlyFare } from '../services/directions'
import type { CandidateLocation, RouteStep } from '../types'

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

interface Props {
  candidate: CandidateLocation
  index: number
  onRemove: (id: string) => void
}

export default function LocationCard({ candidate, index, onRemove }: Props) {
  const color = CANDIDATE_COLORS[index % CANDIDATE_COLORS.length]
  const { transit, walk } = candidate.routes
  const monthlyFare = transit?.fare ? calcMonthlyFare(transit.fare) : null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ background: color }}
        >
          {candidate.label}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{candidate.name}</p>
          {monthlyFare && (
            <p className="text-xs text-gray-400 mt-0.5">월 교통비 약 {formatFare(monthlyFare)}</p>
          )}
        </div>
        <button
          onClick={() => onRemove(candidate.id)}
          className="text-gray-300 hover:text-gray-500 text-lg leading-none transition-colors"
        >
          ×
        </button>
      </div>

      {/* Loading */}
      {candidate.loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin" />
          경로 계산 중...
        </div>
      )}

      {/* Error */}
      {!candidate.loading && candidate.error && (
        <p className="text-xs text-red-400 py-1">{candidate.error}</p>
      )}

      {/* Route summary */}
      {!candidate.loading && (transit || walk) && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-blue-50 rounded-lg p-2 text-center">
              <div className="text-base">🚇</div>
              <div className="text-xs text-gray-400 mt-0.5">대중교통</div>
              {transit ? (
                <>
                  <div className="text-sm font-semibold text-gray-800 mt-1">
                    {formatDuration(transit.duration)}
                  </div>
                  <div className="text-xs text-gray-400">{formatFare(transit.fare)}</div>
                </>
              ) : (
                <div className="text-xs text-gray-300 mt-1">—</div>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <div className="text-base">🚶</div>
              <div className="text-xs text-gray-400 mt-0.5">도보</div>
              {walk ? (
                <div className="text-sm font-semibold text-gray-800 mt-1">
                  {formatDuration(walk.duration)}
                </div>
              ) : (
                <div className="text-xs text-gray-300 mt-1">—</div>
              )}
            </div>
          </div>

          {/* Route detail */}
          {transit?.steps && <RouteSteps steps={transit.steps} />}
        </>
      )}
    </div>
  )
}
