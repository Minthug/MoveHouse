import { calcMonthlyFare } from '../services/directions'
import type { CandidateLocation } from '../types'

const CANDIDATE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899']

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}분`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`
}

function formatFare(fare: number): string {
  return fare.toLocaleString('ko-KR') + '원'
}

interface Props {
  candidate: CandidateLocation
  index: number
  onRemove: (id: string) => void
}

export default function LocationCard({ candidate, index, onRemove }: Props) {
  const color = CANDIDATE_COLORS[index % CANDIDATE_COLORS.length]
  const { transit, driving, walk } = candidate.routes

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
            <p className="text-xs text-gray-400 mt-0.5">
              월 교통비 약 {formatFare(monthlyFare)}
            </p>
          )}
        </div>
        <button
          onClick={() => onRemove(candidate.id)}
          className="text-gray-300 hover:text-gray-500 text-lg leading-none transition-colors"
        >
          ×
        </button>
      </div>

      {/* Loading state */}
      {candidate.loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin" />
          경로 계산 중...
        </div>
      )}

      {/* Error state */}
      {!candidate.loading && candidate.error && (
        <p className="text-xs text-red-400 py-1">{candidate.error}</p>
      )}

      {/* Route results */}
      {!candidate.loading && (transit || driving || walk) && (
        <div className="grid grid-cols-3 gap-2">
          <RouteCell
            emoji="🚇"
            label="대중교통"
            value={transit ? formatDuration(transit.duration) : null}
            sub={transit ? formatFare(transit.fare) : null}
            note="추정"
          />
          <RouteCell
            emoji="🚗"
            label="자가용"
            value={driving ? formatDuration(driving.duration) : null}
            sub={null}
          />
          <RouteCell
            emoji="🚶"
            label="도보"
            value={walk ? formatDuration(walk.duration) : null}
            sub={null}
          />
        </div>
      )}
    </div>
  )
}

function RouteCell({
  emoji,
  label,
  value,
  sub,
  note,
}: {
  emoji: string
  label: string
  value: string | null
  sub: string | null
  note?: string
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 text-center">
      <div className="text-base">{emoji}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      {value ? (
        <>
          <div className="text-sm font-semibold text-gray-800 mt-1">{value}</div>
          {sub && <div className="text-xs text-gray-400">{sub}</div>}
          {note && <div className="text-xs text-orange-400">{note}</div>}
        </>
      ) : (
        <div className="text-xs text-gray-300 mt-1">—</div>
      )}
    </div>
  )
}
