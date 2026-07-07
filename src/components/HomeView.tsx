import { useState, useRef, useEffect } from 'react'
import type { Board } from '../types'

interface Props {
  boards: Board[]
  onOpen: (id: string) => void
  onAdd: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export default function HomeView({ boards, onOpen, onAdd, onRename, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
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

  return (
    <div className="w-full h-screen overflow-y-auto bg-[#f4f6fa]" style={{ fontFamily: 'Pretendard, system-ui, sans-serif' }}>
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-extrabold text-gray-900">이사 통근 비교</h1>
        <p className="text-sm text-gray-500 mt-1">
          비교할 상황을 페이지로 만들어 두고 골라 보세요. 각 비교는 목적지와 후보지 최대 5곳을 담아요.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-8">
          {boards.map((b) => {
            const destName = b.destination?.name ?? null
            const count = b.candidates.length
            const editing = editingId === b.id
            return (
              <div
                key={b.id}
                onClick={() => !editing && onOpen(b.id)}
                className="group relative bg-white rounded-2xl border border-gray-200 shadow-sm p-4 h-36 flex flex-col cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
              >
                {/* 우상단 액션: 이름변경 / 삭제 */}
                {!editing && (
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

                <div className="text-2xl">🗂️</div>

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
                    className="mt-2 w-full text-sm font-bold border border-blue-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-200"
                  />
                ) : (
                  <div
                    className="mt-2 font-bold text-gray-900 truncate"
                    onDoubleClick={(e) => startEdit(b, e)}
                    title="더블클릭 또는 ✏️로 이름 변경"
                  >
                    {b.name}
                  </div>
                )}

                <div className="mt-auto text-xs text-gray-500 space-y-0.5">
                  <div className="truncate">
                    {destName ? <>📍 {destName}</> : <span className="text-gray-400">목적지 미설정</span>}
                  </div>
                  <div className="text-gray-400">후보지 {count}곳</div>
                </div>
              </div>
            )
          })}

          {/* 새 비교 카드 */}
          <button
            onClick={onAdd}
            className="rounded-2xl border-2 border-dashed border-gray-300 h-36 flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-all"
          >
            <span className="text-3xl leading-none">+</span>
            <span className="text-sm font-medium mt-1">새 비교</span>
          </button>
        </div>
      </div>
    </div>
  )
}
