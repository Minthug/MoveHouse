import Linkify from './Linkify'
import { calcMonthlyFare } from '../services/directions'
import type { CandidateLocation, Destination, RouteResult } from '../types'

const CANDIDATE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899']
const MEDALS = ['🥇', '🥈', '🥉', '4위', '5위']

function fmtDur(m: number) {
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60), mm = m % 60
  return mm ? `${h}시간 ${mm}분` : `${h}시간`
}
const fmtFare = (f: number) => f.toLocaleString('ko-KR') + '원'

function legStats(r?: RouteResult) {
  const steps = r?.steps ?? []
  const legs = steps.filter((s) => s.type === 'subway' || s.type === 'bus').length
  const walk = steps.filter((s) => s.type === 'walk').reduce((a, s) => a + s.duration, 0)
  return { transfers: Math.max(0, legs - 1), walk }
}

function routeIcon(r?: RouteResult) {
  const steps = r?.steps ?? []
  const hasSubway = steps.some((s) => s.type === 'subway')
  const hasBus = steps.some((s) => s.type === 'bus')
  if (hasSubway && hasBus) return '🚇🚌'
  if (hasBus) return '🚌'
  if (hasSubway) return '🚇'
  return '🚶'
}

interface Props {
  boardName: string
  destination: Destination | null
  destination2: Destination | null
  candidates: CandidateLocation[]
  onImport: () => void
  onHome: () => void
}

export default function SharedView({ boardName, destination, destination2, candidates, onImport, onHome }: Props) {
  const hasDest2 = !!destination2
  const dur = (c: CandidateLocation) =>
    (c.routes.transit?.duration ?? 0) + (hasDest2 ? (c.routes2?.transit?.duration ?? 0) : 0)
  const fare = (c: CandidateLocation) =>
    (c.routes.transit?.fare ?? 0) + (hasDest2 ? (c.routes2?.transit?.fare ?? 0) : 0)
  const realCost = (c: CandidateLocation) => (c.rent != null ? c.rent + calcMonthlyFare(fare(c)) : null)

  const ready = candidates.filter((c) => c.routes.transit)
  const ranked = [...candidates].sort((a, b) => {
    const ra = a.routes.transit ? dur(a) : Infinity
    const rb = b.routes.transit ? dur(b) : Infinity
    return ra - rb
  })

  const realCosts = ready.map(realCost).filter((v): v is number => v != null)
  const minReal = realCosts.length >= 2 ? Math.min(...realCosts) : null

  return (
    <div className="w-full h-screen overflow-y-auto bg-[#f4f6fa]" style={{ fontFamily: 'Pretendard, system-ui, sans-serif' }}>
      <div className="max-w-2xl mx-auto px-5 py-8">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 font-medium">공유된 이사 후보 비교</p>
            <h1 className="text-2xl font-extrabold text-gray-900 truncate">{boardName || '이사 후보 비교'}</h1>
            <p className="text-xs text-gray-500 mt-1">상대가 고른 후보지들을 내 목적지 기준으로도 다시 볼 수 있어요.</p>
          </div>
          <button
            onClick={onImport}
            className="shrink-0 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-xl transition-colors"
          >
            내 기준으로 같이 비교하기
          </button>
        </div>

        {/* 목적지 */}
        <div className="flex flex-wrap gap-2 mt-3">
          {destination && (
            <span className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
              <span style={{ color: '#ef4444' }}>★</span> {destination.name}
            </span>
          )}
          {destination2 && (
            <span className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
              <span style={{ color: '#0d9488' }}>★</span> {destination2.name}
            </span>
          )}
        </div>

        {/* 후보지 카드 */}
        <div className="mt-6 space-y-3">
          {ranked.map((c, i) => {
            const oi = candidates.findIndex((x) => x.id === c.id)
            const color = CANDIDATE_COLORS[oi % CANDIDATE_COLORS.length]
            const t = c.routes.transit
            const t2 = c.routes2?.transit
            const st = legStats(t)
            const st2 = hasDest2 ? legStats(t2) : { transfers: 0, walk: 0 }
            const rc = realCost(c)
            const isBestReal = rc != null && minReal != null && rc === minReal
            const isFastest = i === 0 && ready.length >= 2 && !!t

            return (
              <div key={c.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${isFastest ? 'border-yellow-300 ring-2 ring-yellow-100' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{MEDALS[i] ?? ''}</span>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: color }}>
                    {c.label}
                  </div>
                  <span className="font-bold text-gray-900 flex-1 line-clamp-2 break-keep leading-snug" title={c.name}>{c.name}</span>
                  <div className="flex gap-1 shrink-0">
                    {isFastest && <span className="text-[11px] font-medium text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">{hasDest2 ? '합산 최단' : '최단'}</span>}
                    {isBestReal && <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">💵 실질 최저</span>}
                  </div>
                </div>

                {!t ? (
                  <p className="text-xs text-gray-400 mt-2 pl-10">경로 계산 중…</p>
                ) : (
                  <div className="mt-2 pl-10 space-y-1">
                    {!hasDest2 ? (
                      <p className="text-sm text-gray-700">{routeIcon(t)} {fmtDur(t.duration)} · {fmtFare(t.fare)}</p>
                    ) : (
                      <div className="text-sm text-gray-700">
                        <span className="mr-3"><span style={{ color: '#ef4444' }}>★</span> {fmtDur(t.duration)}</span>
                        {t2 && <span><span style={{ color: '#0d9488' }}>★</span> {fmtDur(t2.duration)}</span>}
                        <span className="ml-2 font-semibold">· 합계 {fmtDur(dur(c))}</span>
                      </div>
                    )}
                    <p className="text-xs text-gray-500">
                      🔁 환승 {st.transfers + st2.transfers}회 · 🚶 도보 {st.walk + st2.walk}분
                    </p>
                    {rc != null && (
                      <p className="text-xs font-semibold text-gray-800">
                        🏠 실질 월 {fmtFare(rc)} <span className="text-gray-400 font-normal">(월세 {fmtFare(c.rent!)} + 교통 {fmtFare(calcMonthlyFare(fare(c)))})</span>
                      </p>
                    )}
                    {c.memo && (
                      <p className="text-xs text-gray-400 whitespace-pre-wrap break-keep">
                        📝 <Linkify text={c.memo} />
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {candidates.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-10">후보지가 없는 비교예요.</p>
          )}
        </div>

        <button onClick={onHome} className="mt-6 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          ← 내 비교 목록으로
        </button>
      </div>
    </div>
  )
}
