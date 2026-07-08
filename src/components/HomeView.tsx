import { useState, useRef, useEffect } from 'react'
import type { Board } from '../types'

const COMPARE_GUIDE_KEY = 'commute-board-compare-guide-seen'

function shouldShowCompareGuide() {
  try {
    return !localStorage.getItem(COMPARE_GUIDE_KEY)
  } catch {
    return true
  }
}

interface Props {
  boards: Board[]
  onOpen: (id: string) => void
  onAdd: () => void
  onCompare: (ids: [string, string]) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export default function HomeView({ boards, onOpen, onAdd, onCompare, onRename, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showCompareGuide, setShowCompareGuide] = useState(shouldShowCompareGuide)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) inputRef.current?.focus()
  }, [editingId])

  function startEdit(b: Board, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(b.id)
    setDraft(b.name)
  }
  function commit() {
    if (editingId) {
      onRename(editingId, draft)
      setEditingId(null)
    }
  }

  function bestDuration(b: Board) {
    const durations = b.candidates
      .map((c) => c.routes.transit?.duration)
      .filter((v): v is number => typeof v === 'number')
    if (durations.length === 0) return null
    return Math.min(...durations)
  }

  function rentRange(b: Board) {
    const rents = b.candidates
      .map((c) => c.rent)
      .filter((v): v is number => typeof v === 'number' && v > 0)
    if (rents.length === 0) return null
    const min = Math.min(...rents)
    const max = Math.max(...rents)
    const fmt = (v: number) => `${Math.round(v / 10000)}만`
    return min === max ? fmt(min) : `${fmt(min)}-${fmt(max)}`
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      return prev.length >= 2 ? [prev[1], id] : [...prev, id]
    })
  }

  function startSelecting() {
    setSelecting(true)
    setSelectedIds([])
  }

  function closeCompareGuide() {
    setShowCompareGuide(false)
    try { localStorage.setItem(COMPARE_GUIDE_KEY, '1') } catch {
      // localStorage may be unavailable in restricted browsers.
    }
  }

  function startSelectingFromGuide() {
    closeCompareGuide()
    if (boards.length < 2) {
      onAdd()
      return
    }
    startSelecting()
  }

  function cancelSelecting() {
    setSelecting(false)
    setSelectedIds([])
  }

  function compareSelected() {
    if (selectedIds.length !== 2) return
    onCompare([selectedIds[0], selectedIds[1]])
  }

  return (
    <div className="w-full h-screen overflow-y-auto bg-[#f4f6fa]" style={{ fontFamily: 'Pretendard, system-ui, sans-serif' }}>
      {showCompareGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-gray-100 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600">
                  새 기능
                </div>
                <h2 className="mt-3 text-lg font-extrabold text-gray-900">비교 2개를 같이 볼 수 있어요</h2>
              </div>
              <button
                onClick={closeCompareGuide}
                className="text-xl leading-none text-gray-300 hover:text-gray-500 transition-colors"
                title="닫기"
              >
                ×
              </button>
            </div>

            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              목록에서 카드 2개를 선택하면 목적지, 후보지, 평균 통근 시간, 월세 범위를 요약해서 비교해요.
            </p>

            <div className="mt-4 rounded-xl bg-gray-50 px-3 py-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                <span>비교 선택을 누르기</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                <span>카드 2개 고르기</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold">3</span>
                <span>두 비교 같이 보기</span>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={closeCompareGuide}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
              >
                나중에
              </button>
              <button
                onClick={startSelectingFromGuide}
                className="flex-1 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors"
              >
                {boards.length >= 2 ? '비교 선택 시작' : '새 비교 만들기'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">이사가자</h1>
            <p className="text-sm text-gray-500 mt-1">
              비교할 상황을 페이지로 만들어 두고 골라 보세요. 각 비교는 목적지와 후보지 최대 5곳을 담아요.
            </p>
          </div>
          <button
            onClick={onAdd}
            className="shrink-0 text-xs font-semibold text-white bg-gray-800 hover:bg-gray-900 px-3 py-2 rounded-full transition-colors"
          >
            새 비교
          </button>
        </div>

        <div className="mt-6 rounded-2xl bg-white border border-gray-200 shadow-sm px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900">비교 목록</div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {selecting ? `카드 ${selectedIds.length}/2개 선택됨` : `${boards.length}개 비교 보드`}
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {selecting ? (
                <>
                  <button
                    onClick={cancelSelecting}
                    className="text-xs font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-full transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={compareSelected}
                    disabled={selectedIds.length !== 2}
                    className="text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed px-3 py-2 rounded-full transition-colors"
                  >
                    두 비교 보기
                  </button>
                </>
              ) : (
              <button
                onClick={startSelecting}
                disabled={boards.length < 2}
                className="text-xs font-semibold text-blue-500 bg-white border border-blue-100 hover:border-blue-200 hover:bg-blue-50 disabled:text-gray-300 disabled:border-gray-200 disabled:hover:bg-white disabled:cursor-not-allowed px-3 py-2 rounded-full transition-colors"
              >
                비교 선택
              </button>
            )}
            </div>
          </div>
        </div>
        {selecting && (
          <div className="mt-3 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-600">
            비교할 카드 2개를 선택하세요. 선택 순서대로 왼쪽/오른쪽에 배치됩니다.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
          {boards.map((b) => {
            const destName = b.destination?.name ?? null
            const count = b.candidates.length
            const editing = editingId === b.id
            const duration = bestDuration(b)
            const rent = rentRange(b)
            const candidates = b.candidates.slice(0, 2)
            const selected = selectedIds.includes(b.id)
            return (
              <div
                key={b.id}
                onClick={() => {
                  if (editing) return
                  if (selecting) toggleSelected(b.id)
                  else onOpen(b.id)
                }}
                className={`group relative bg-white rounded-2xl border shadow-sm p-4 h-52 flex flex-col cursor-pointer hover:border-blue-300 hover:shadow-md transition-all ${
                  selected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'
                }`}
              >
                {selecting && (
                  <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold ${
                    selected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-gray-200 text-gray-300'
                  }`}>
                    {selected ? selectedIds.indexOf(b.id) + 1 : ''}
                  </div>
                )}
                {/* 우상단 액션: 이름변경 / 삭제 */}
                {!editing && !selecting && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => startEdit(b, e)}
                      className="text-gray-300 hover:text-gray-600 text-sm leading-none"
                      title="이름 변경"
                    >
                      ✏️
                    </button>
                    {boards.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm(`'${b.name}' 비교를 삭제할까요?`)) onDelete(b.id)
                        }}
                        className="text-gray-300 hover:text-red-400 text-lg leading-none"
                        title="삭제"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-start gap-2 pr-8">
                  <div className="text-2xl leading-none">🗂️</div>
                  <div className="min-w-0 flex-1">

                    {editing ? (
                      <input
                        ref={inputRef}
                        value={draft}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commit()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="w-full text-sm font-bold border border-blue-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    ) : (
                      <div
                        className="font-bold text-gray-900 truncate"
                        onDoubleClick={(e) => startEdit(b, e)}
                        title="더블클릭 또는 ✏️로 이름 변경"
                      >
                        {b.name}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  <div className="truncate">
                    {destName ? <>📍 {destName}</> : <span className="text-gray-400">목적지 미설정</span>}
                  </div>
                  {b.destination2 && (
                    <div className="mt-1 truncate text-teal-600">
                      📍 {b.destination2.name}
                    </div>
                  )}
                </div>

                <div className="mt-auto">
                  <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                    <div className="rounded-lg bg-gray-50 px-2 py-1.5">
                      <div className="text-gray-400">후보</div>
                      <div className="font-bold text-gray-800">{count}곳</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-2 py-1.5">
                      <div className="text-gray-400">최단</div>
                      <div className="font-bold text-gray-800">{duration ? `${duration}분` : '-'}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-2 py-1.5">
                      <div className="text-gray-400">월세</div>
                      <div className="font-bold text-gray-800 truncate">{rent ?? '-'}</div>
                    </div>
                  </div>

                  <div className="mt-2 min-h-5 flex flex-wrap gap-1">
                    {candidates.length > 0 ? (
                      <>
                        {candidates.map((c) => (
                          <span key={c.id} className="max-w-full rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 truncate">
                            {c.label}. {c.name}
                          </span>
                        ))}
                        {count > candidates.length && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-400">
                            +{count - candidates.length}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">후보지를 추가해 비교를 시작하세요</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* 새 비교 카드 */}
          <button
            onClick={onAdd}
            disabled={selecting}
            className="rounded-2xl border-2 border-dashed border-gray-300 h-52 flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-400 disabled:cursor-not-allowed transition-all"
          >
            <span className="text-3xl leading-none">+</span>
            <span className="text-sm font-medium mt-1">새 비교</span>
          </button>
        </div>
      </div>
    </div>
  )
}
