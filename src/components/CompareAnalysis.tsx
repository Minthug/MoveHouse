import { calcMonthlyFare } from '../services/directions'
import type { CandidateLocation, RouteResult } from '../types'

// 경로에서 환승 횟수·총 도보 시간 추출
function legStats(r?: RouteResult): { transfers: number; walk: number } {
  const steps = r?.steps ?? []
  const vehicleLegs = steps.filter((s) => s.type === 'subway' || s.type === 'bus').length
  const walk = steps.filter((s) => s.type === 'walk').reduce((a, s) => a + s.duration, 0)
  return { transfers: Math.max(0, vehicleLegs - 1), walk }
}

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
  hasDest2?: boolean
  selectedCandidateId: string | null
  onSelectCandidate: (id: string, routeType: 'transit' | 'bus') => void
  onBack: () => void
}

export default function CompareAnalysis({ candidates, hasDest2, selectedCandidateId, onSelectCandidate, onBack }: Props) {
  // 합산 기준: 두 목적지 모두 경로가 있어야 비교 대상
  const ready = candidates.filter((c) =>
    !c.loading && c.routes.transit && (!hasDest2 || c.routes2?.transit),
  )

  // 순위 기준값: 두 목적지면 합산, 아니면 주 목적지
  const dur = (c: CandidateLocation) =>
    (c.routes.transit?.duration ?? 0) + (hasDest2 ? (c.routes2?.transit?.duration ?? 0) : 0)
  const fare = (c: CandidateLocation) =>
    (c.routes.transit?.fare ?? 0) + (hasDest2 ? (c.routes2?.transit?.fare ?? 0) : 0)

  // 실질 월 비용 = 월세 + 월 교통비 (월세 입력된 후보지만)
  const realCost = (c: CandidateLocation): number | null =>
    c.rent != null ? c.rent + calcMonthlyFare(fare(c)) : null

  const ranked = [...ready].sort((a, b) => dur(a) - dur(b))
  const maxDuration = Math.max(...ranked.map(dur), 1)
  const maxFare = Math.max(...ranked.map((c) => calcMonthlyFare(fare(c))), 1)
  const realCosts = ranked.map(realCost).filter((v): v is number => v != null)
  const minRealCost = realCosts.length ? Math.min(...realCosts) : null

  // 후보지별 환승·도보 (두 목적지면 합산)
  const stats = new Map(
    ranked.map((c) => {
      const s1 = legStats(c.routes.transit)
      const s2 = hasDest2 ? legStats(c.routes2?.transit) : { transfers: 0, walk: 0 }
      return [c.id, { transfers: s1.transfers + s2.transfers, walk: s1.walk + s2.walk }]
    }),
  )

  // 강점 배지: 각 지표의 최솟값 보유자에게 부여 (값이 모두 같으면 배지 없음)
  const vary = (vals: number[]) => new Set(vals).size > 1
  const durs = ranked.map(dur)
  const fares = ranked.map(fare)
  const transfersArr = ranked.map((c) => stats.get(c.id)!.transfers)
  const walksArr = ranked.map((c) => stats.get(c.id)!.walk)
  const minDur = Math.min(...durs), minFare = Math.min(...fares)
  const minTransfers = Math.min(...transfersArr), minWalk = Math.min(...walksArr)

  function badges(c: CandidateLocation): string[] {
    const st = stats.get(c.id)!
    const out: string[] = []
    // 월세가 2곳 이상 입력돼 실질 비교가 가능하면 '저렴'은 실질 기준, 아니면 교통비 기준
    const realCostComparable = realCosts.length >= 2 && new Set(realCosts).size > 1
    if (vary(durs) && dur(c) === minDur) out.push('⚡ 가장 빠름')
    if (!realCostComparable && vary(fares) && fare(c) === minFare) out.push('💰 교통비 최저')
    if (st.transfers === minTransfers && (st.transfers === 0 || vary(transfersArr)))
      out.push(st.transfers === 0 ? '🔁 환승 없음' : '🔁 환승 최소')
    if (vary(walksArr) && st.walk === minWalk) out.push('🚶 도보 최소')
    const rc = realCost(c)
    if (rc != null && minRealCost != null && rc === minRealCost && realCostComparable)
      out.push('💵 실질 최저')
    return out
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
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
          <p className="text-xs text-gray-400">
            {ranked.length}개 후보지 · {hasDest2 ? '두 목적지 합산 시간 기준' : '통근 시간 기준'} 정렬
          </p>
        </div>
      </div>

      {ranked.length < 2 ? (
        <div className="flex-1 flex items-center justify-center text-center p-8">
          <div>
            <div className="text-4xl mb-3">📊</div>
            <p className="text-sm text-gray-500">
              {hasDest2
                ? <>두 목적지 경로가 모두 계산된<br />후보지가 2개 이상 있어야 해요</>
                : <>경로가 계산된 후보지가<br />2개 이상 있어야 해요</>}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {ranked.map((c, i) => {
            const transit = c.routes.transit!
            const transit2 = c.routes2?.transit
            const totalDur = dur(c)
            const monthly = calcMonthlyFare(fare(c))
            const timeRatio = totalDur / maxDuration
            const fareRatio = monthly / maxFare
            const originalIndex = candidates.findIndex((x) => x.id === c.id)
            const color = CANDIDATE_COLORS[originalIndex % CANDIDATE_COLORS.length]
            const isFirst = i === 0

            const transitSteps = (transit.steps ?? []).filter((s) => s.type !== 'walk')
            const st = stats.get(c.id)!
            const bs = badges(c)

            const isSelected = selectedCandidateId === c.id

            return (
              <div
                key={c.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden cursor-pointer transition-all ${
                  isSelected ? 'border-blue-400 ring-2 ring-blue-100' :
                  isFirst ? 'border-yellow-300 ring-2 ring-yellow-100' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => onSelectCandidate(c.id, 'transit')}
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
                      {hasDest2 ? '합산 최단' : '최단 시간'}
                    </span>
                  )}
                </div>

                {/* 강점 배지 */}
                {bs.length > 0 && (
                  <div className="px-4 pb-1 flex flex-wrap gap-1">
                    {bs.map((b) => (
                      <span key={b} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {b}
                      </span>
                    ))}
                  </div>
                )}

                <div className="px-4 pb-4 space-y-3">
                  {/* 환승·도보 요약 */}
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">🔁 환승 {st.transfers}회</span>
                    <span className="text-gray-300">·</span>
                    <span className="flex items-center gap-1">🚶 도보 {st.walk}분</span>
                  </div>

                  {/* 통근 시간 바 */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-400">{hasDest2 ? '합산 통근 시간' : '통근 시간'}</span>
                      <span className="text-sm font-bold text-gray-800">{formatDuration(totalDur)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${timeRatio * 100}%`, background: color }}
                      />
                    </div>
                    {hasDest2 && transit2 && (
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <span style={{ color: '#ef4444' }}>★</span>{formatDuration(transit.duration)}
                        </span>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <span style={{ color: '#0d9488' }}>★</span>{formatDuration(transit2.duration)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 요금 바 */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-400">
                        {hasDest2 ? '월 교통비 합산' : '월 교통비'} <span className="text-gray-300">(22일 기준)</span>
                      </span>
                      <span className="text-sm font-bold text-gray-800">{formatFare(monthly)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${fareRatio * 100}%`, background: color, opacity: 0.6 }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 text-right">편도 {formatFare(fare(c))}</p>
                  </div>

                  {/* 실질 월 비용 (월세 + 교통비) */}
                  {realCost(c) != null && (
                    <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                      <span className="text-xs text-gray-500">🏠 실질 월 비용 <span className="text-gray-300">(월세+교통)</span></span>
                      <span className="text-sm font-bold text-gray-900">{formatFare(realCost(c)!)}</span>
                    </div>
                  )}

                  {/* 노선 배지 (주 목적지 기준) */}
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
              <p>⏱ {hasDest2 ? '합산 최단' : '가장 빠른 곳'}: <strong>{ranked[0].name}</strong> ({formatDuration(dur(ranked[0]))})</p>
              <p>💰 가장 저렴한 곳: <strong>
                {[...ranked].sort((a, b) => fare(a) - fare(b))[0].name}
              </strong> (월 {formatFare(calcMonthlyFare(fare([...ranked].sort((a, b) => fare(a) - fare(b))[0])))})</p>
              {ranked.length > 1 && (
                <p>🕐 시간 차이: <strong>{dur(ranked[ranked.length - 1]) - dur(ranked[0])}분</strong> ({ranked[0].name} vs {ranked[ranked.length - 1].name})</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
