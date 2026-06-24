import { calcMonthlyFare } from '../services/directions'
import type { CandidateLocation } from '../types'

const CANDIDATE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899']
const MEDALS = ['🥇', '🥈', '🥉', '4위', '5위']

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}분`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`
}

function formatFare(fare: number): string {
  return fare.toLocaleString('ko-KR') + '원'
}

function shortLineName(name?: string) {
  if (!name) return '지하철'
  return name.replace('수도권 ', '')
}

const SUBWAY_LINE_COLORS: Record<string, string> = {
  '1호선': '#0052A4', '2호선': '#00A84D', '3호선': '#EF7C1C',
  '4호선': '#00A5DE', '5호선': '#996CAC', '6호선': '#CD7C2F',
  '7호선': '#747F00', '8호선': '#E6186C', '9호선': '#BDB092',
  '신분당선': '#D31145', '공항철도': '#0090D2',
}

function lineColor(name?: string) {
  if (!name) return '#6b7280'
  for (const [k, v] of Object.entries(SUBWAY_LINE_COLORS)) {
    if (name.includes(k)) return v
  }
  return '#6b7280'
}

interface Props {
  candidates: CandidateLocation[]
  selectedCandidateId: string | null
  onSelectCandidate: (id: string) => void
  onBack: () => void
}

export default function CompareAnalysis({ candidates, selectedCandidateId, onSelectCandidate, onBack }: Props) {
  const ready = candidates.filter((c) => c.routes.transit && !c.loading)

  const ranked = [...ready].sort(
    (a, b) => (a.routes.transit!.duration) - (b.routes.transit!.duration),
  )

  const maxDuration = Math.max(...ranked.map((c) => c.routes.transit!.duration), 1)
  const maxFare = Math.max(...ranked.map((c) => calcMonthlyFare(c.routes.transit!.fare)), 1)

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="p-4 bg-white border-b border-gray-200 flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none"
        >
          ←
        </button>
        <div>
          <h2 className="text-sm font-bold text-gray-900">비교 분석</h2>
          <p className="text-xs text-gray-400">{ranked.length}개 후보지 · 통근 시간 기준 정렬</p>
        </div>
      </div>

      {ranked.length < 2 ? (
        <div className="flex-1 flex items-center justify-center text-center p-8">
          <div>
            <div className="text-4xl mb-3">📊</div>
            <p className="text-sm text-gray-500">경로가 계산된 후보지가<br />2개 이상 있어야 해요</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {ranked.map((c, i) => {
            const transit = c.routes.transit!
            const monthly = calcMonthlyFare(transit.fare)
            const timeRatio = transit.duration / maxDuration
            const fareRatio = monthly / maxFare
            const originalIndex = candidates.findIndex((x) => x.id === c.id)
            const color = CANDIDATE_COLORS[originalIndex % CANDIDATE_COLORS.length]
            const isFirst = i === 0

            const transitSteps = (transit.steps ?? []).filter((s) => s.type !== 'walk')

            const isSelected = selectedCandidateId === c.id

            return (
              <div
                key={c.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden cursor-pointer transition-all ${
                  isSelected ? 'border-blue-400 ring-2 ring-blue-100' :
                  isFirst ? 'border-yellow-300 ring-2 ring-yellow-100' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => onSelectCandidate(c.id)}
              >
                {/* Candidate header */}
                <div className="flex items-center gap-3 px-4 pt-4 pb-2">
                  <span className="text-xl">{MEDALS[i]}</span>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: color }}
                  >
                    {c.label}
                  </div>
                  <span className="text-sm font-semibold text-gray-800 flex-1 truncate">{c.name}</span>
                  {isSelected && (
                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      지도 표시 중
                    </span>
                  )}
                  {!isSelected && isFirst && (
                    <span className="text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
                      최단 시간
                    </span>
                  )}
                </div>

                <div className="px-4 pb-4 space-y-3">
                  {/* 통근 시간 바 */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-400">통근 시간</span>
                      <span className="text-sm font-bold text-gray-800">{formatDuration(transit.duration)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${timeRatio * 100}%`, background: color }}
                      />
                    </div>
                  </div>

                  {/* 요금 바 */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-400">월 교통비 <span className="text-gray-300">(22일 기준)</span></span>
                      <span className="text-sm font-bold text-gray-800">{formatFare(monthly)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${fareRatio * 100}%`, background: color, opacity: 0.6 }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 text-right">편도 {formatFare(transit.fare)}</p>
                  </div>

                  {/* 노선 배지 */}
                  {transitSteps.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-gray-100">
                      {transitSteps.map((step, si) => (
                        <span
                          key={si}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-white"
                          style={{ background: step.type === 'subway' ? lineColor(step.name) : '#22c55e' }}
                        >
                          {step.type === 'subway' ? '🚇' : '🚌'} {shortLineName(step.name)}
                          {step.duration > 0 && <span className="opacity-75">{step.duration}분</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* 요약 */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <p className="text-xs font-semibold text-blue-700 mb-2">📋 요약</p>
            <div className="space-y-1 text-xs text-blue-800">
              <p>⏱ 가장 빠른 곳: <strong>{ranked[0].name}</strong> ({formatDuration(ranked[0].routes.transit!.duration)})</p>
              <p>💰 가장 저렴한 곳: <strong>
                {[...ranked].sort((a, b) => a.routes.transit!.fare - b.routes.transit!.fare)[0].name}
              </strong> (월 {formatFare(calcMonthlyFare([...ranked].sort((a, b) => a.routes.transit!.fare - b.routes.transit!.fare)[0].routes.transit!.fare))})</p>
              {ranked.length > 1 && (
                <p>🕐 시간 차이: <strong>{ranked[ranked.length - 1].routes.transit!.duration - ranked[0].routes.transit!.duration}분</strong> ({ranked[0].name} vs {ranked[ranked.length - 1].name})</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
