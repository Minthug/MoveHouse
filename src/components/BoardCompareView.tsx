import type { ReactNode } from 'react'
import type { Board, CandidateLocation } from '../types'

interface Props {
  boards: [Board, Board]
  onBack: () => void
  onOpen: (id: string) => void
  themeToggle?: ReactNode
}

function fmtDuration(minutes?: number) {
  if (minutes == null) return '-'
  if (minutes < 60) return `${minutes}분`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}시간 ${m}분` : `${h}시간`
}

function fmtRent(value?: number) {
  return value ? `${Math.round(value / 10000)}만` : '-'
}

function fmtDiff(minutes: number) {
  if (minutes === 0) return '동일'
  return `${Math.abs(minutes)}분 ${minutes > 0 ? '빠름' : '느림'}`
}

function bestCandidate(board: Board): CandidateLocation | null {
  const ready = board.candidates.filter((c) => c.routes.transit)
  if (ready.length === 0) return null
  return [...ready].sort((a, b) => a.routes.transit!.duration - b.routes.transit!.duration)[0]
}

function avgDuration(board: Board) {
  const durations = board.candidates
    .map((c) => c.routes.transit?.duration)
    .filter((v): v is number => typeof v === 'number')
  if (durations.length === 0) return undefined
  return Math.round(durations.reduce((sum, v) => sum + v, 0) / durations.length)
}

function minRent(board: Board) {
  const rents = board.candidates
    .map((c) => c.rent)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  return rents.length ? Math.min(...rents) : undefined
}

function rentRange(board: Board) {
  const rents = board.candidates
    .map((c) => c.rent)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  if (rents.length === 0) return '-'
  const min = Math.min(...rents)
  const max = Math.max(...rents)
  return min === max ? fmtRent(min) : `${fmtRent(min)}-${fmtRent(max)}`
}

function summaryLine(boards: [Board, Board]) {
  const [a, b] = boards
  const avgA = avgDuration(a)
  const avgB = avgDuration(b)
  const bestA = bestCandidate(a)
  const bestB = bestCandidate(b)

  if (avgA != null && avgB != null) {
    if (avgA === avgB) return `평균 통근 시간은 두 비교가 모두 ${fmtDuration(avgA)}로 비슷합니다.`
    const faster = avgA < avgB ? a : b
    const diff = Math.abs(avgA - avgB)
    return `${faster.name} 쪽 평균 통근 시간이 ${diff}분 더 짧습니다.`
  }

  if (bestA && bestB) {
    const durA = bestA.routes.transit!.duration
    const durB = bestB.routes.transit!.duration
    if (durA === durB) return `최단 후보는 두 비교 모두 ${fmtDuration(durA)}입니다.`
    const faster = durA < durB ? { board: a, candidate: bestA, diff: durB - durA } : { board: b, candidate: bestB, diff: durA - durB }
    return `${faster.board.name}의 ${faster.candidate.name} 후보가 최단 기준 ${faster.diff}분 더 빠릅니다.`
  }

  return '아직 경로가 계산된 후보지가 부족해요. 각 보드에서 후보지 경로가 계산되면 요약이 더 선명해집니다.'
}

function SummaryPanel({ boards }: { boards: [Board, Board] }) {
  const [a, b] = boards
  const avgA = avgDuration(a)
  const avgB = avgDuration(b)
  const bestA = bestCandidate(a)
  const bestB = bestCandidate(b)
  const rentA = minRent(a)
  const rentB = minRent(b)
  const fasterBoard =
    avgA != null && avgB != null && avgA !== avgB
      ? (avgA < avgB ? a : b)
      : null
  const moreCandidates =
    a.candidates.length !== b.candidates.length
      ? (a.candidates.length > b.candidates.length ? a : b)
      : null
  const cheaperBoard =
    rentA != null && rentB != null && rentA !== rentB
      ? (rentA < rentB ? a : b)
      : null

  return (
    <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg shrink-0">
          요
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-400">요약</p>
          <p className="mt-1 text-base font-bold text-gray-900 break-keep">{summaryLine(boards)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
        <div className="rounded-xl bg-gray-50 px-3 py-3">
          <div className="text-[11px] font-semibold text-gray-400">통근</div>
          <div className="mt-1 text-sm font-bold text-gray-900 truncate">
            {fasterBoard ? fasterBoard.name : '비슷함'}
          </div>
          <div className="mt-0.5 text-xs text-gray-500">
            {avgA != null && avgB != null ? (
              a === fasterBoard ? fmtDiff(avgB - avgA) : b === fasterBoard ? fmtDiff(avgA - avgB) : `${fmtDuration(avgA)} / ${fmtDuration(avgB)}`
            ) : '평균 부족'}
          </div>
        </div>

        <div className="rounded-xl bg-gray-50 px-3 py-3">
          <div className="text-[11px] font-semibold text-gray-400">선택지</div>
          <div className="mt-1 text-sm font-bold text-gray-900 truncate">
            {moreCandidates ? moreCandidates.name : '동일'}
          </div>
          <div className="mt-0.5 text-xs text-gray-500">
            {a.candidates.length}곳 / {b.candidates.length}곳
          </div>
        </div>

        <div className="rounded-xl bg-gray-50 px-3 py-3">
          <div className="text-[11px] font-semibold text-gray-400">월세 최저</div>
          <div className="mt-1 text-sm font-bold text-gray-900 truncate">
            {cheaperBoard ? cheaperBoard.name : rentA != null && rentB != null ? '비슷함' : '입력 부족'}
          </div>
          <div className="mt-0.5 text-xs text-gray-500">
            {fmtRent(rentA)} / {fmtRent(rentB)}
          </div>
        </div>
      </div>

      {(bestA || bestB) && (
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          최단 후보: {bestA ? `${a.name} - ${bestA.name} ${fmtDuration(bestA.routes.transit?.duration)}` : `${a.name} - 없음`}
          <span className="text-blue-300 mx-2">|</span>
          {bestB ? `${b.name} - ${bestB.name} ${fmtDuration(bestB.routes.transit?.duration)}` : `${b.name} - 없음`}
        </div>
      )}
    </div>
  )
}

function BoardColumn({ board, onOpen }: { board: Board; onOpen: (id: string) => void }) {
  const best = bestCandidate(board)
  const average = avgDuration(board)
  const candidates = board.candidates.slice(0, 5)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col min-h-[520px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 font-medium">비교 보드</p>
          <h2 className="text-lg font-extrabold text-gray-900 truncate">{board.name}</h2>
        </div>
        <button
          onClick={() => onOpen(board.id)}
          className="shrink-0 text-xs font-semibold text-blue-500 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full transition-colors"
        >
          열기
        </button>
      </div>

      <div className="mt-4 rounded-xl bg-gray-50 px-3 py-3">
        <div className="text-[11px] font-semibold text-gray-400">목적지</div>
        <div className="mt-1 text-sm font-semibold text-gray-800 truncate">
          {board.destination?.name ?? '목적지 미설정'}
        </div>
        {board.destination2 && (
          <div className="mt-1 text-xs font-medium text-teal-600 truncate">
            + {board.destination2.name}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
        <div className="rounded-xl border border-gray-100 px-3 py-2">
          <div className="text-gray-400">후보</div>
          <div className="mt-1 font-bold text-gray-900">{board.candidates.length}곳</div>
        </div>
        <div className="rounded-xl border border-gray-100 px-3 py-2">
          <div className="text-gray-400">평균</div>
          <div className="mt-1 font-bold text-gray-900">{fmtDuration(average)}</div>
        </div>
        <div className="rounded-xl border border-gray-100 px-3 py-2">
          <div className="text-gray-400">월세</div>
          <div className="mt-1 font-bold text-gray-900 truncate">{rentRange(board)}</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-yellow-100 bg-yellow-50 px-3 py-3">
        <div className="text-[11px] font-semibold text-yellow-700">최단 후보</div>
        {best ? (
          <>
            <div className="mt-1 text-sm font-bold text-gray-900 truncate">{best.label}. {best.name}</div>
            <div className="mt-1 text-xs text-gray-500">
              {fmtDuration(best.routes.transit?.duration)} · 편도 {(best.routes.transit?.fare ?? 0).toLocaleString('ko-KR')}원
            </div>
          </>
        ) : (
          <div className="mt-1 text-sm text-gray-400">경로 계산된 후보지가 없어요</div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <div className="text-xs font-semibold text-gray-500">후보지</div>
        {candidates.length > 0 ? candidates.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
            <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
              {c.label}
            </span>
            <span className="text-xs font-medium text-gray-700 truncate flex-1">{c.name}</span>
            <span className="text-xs text-gray-400 shrink-0">{fmtDuration(c.routes.transit?.duration)}</span>
          </div>
        )) : (
          <div className="text-xs text-gray-400 rounded-xl border border-dashed border-gray-200 px-3 py-3">
            후보지가 없습니다
          </div>
        )}
      </div>
    </div>
  )
}

export default function BoardCompareView({ boards, onBack, onOpen, themeToggle }: Props) {
  return (
    <div className="w-full h-screen overflow-y-auto bg-[#f4f6fa]" style={{ fontFamily: 'Pretendard, system-ui, sans-serif' }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm px-3 py-3 flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-full transition-colors"
          >
            <span className="text-sm leading-none">‹</span> 비교 목록
          </button>
          <div className="flex items-center gap-2 min-w-0">
            {themeToggle}
            <div className="min-w-0 text-right">
              <div className="text-xs font-bold text-gray-900">보드 2개 비교 중</div>
              <div className="text-[11px] text-gray-400 truncate">{boards[0].name} / {boards[1].name}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">두 비교 같이 보기</h1>
            <p className="text-sm text-gray-500 mt-1">선택한 두 보드의 목적지, 후보지, 통근 요약을 나란히 봅니다.</p>
          </div>
        </div>

        <SummaryPanel boards={boards} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <BoardColumn board={boards[0]} onOpen={onOpen} />
          <BoardColumn board={boards[1]} onOpen={onOpen} />
        </div>
      </div>
    </div>
  )
}
