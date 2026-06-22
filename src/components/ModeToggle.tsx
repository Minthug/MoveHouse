import type { AppMode } from '../types'

interface Props {
  mode: AppMode
  onChange: (mode: AppMode) => void
  canAddCandidate: boolean
}

export default function ModeToggle({ mode, onChange, canAddCandidate }: Props) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onChange('set-destination')}
        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          mode === 'set-destination'
            ? 'bg-red-500 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        <span>★</span>
        <span>목적지 설정</span>
      </button>
      <button
        onClick={() => canAddCandidate && onChange('add-candidate')}
        disabled={!canAddCandidate}
        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          mode === 'add-candidate'
            ? 'bg-blue-500 text-white'
            : canAddCandidate
            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            : 'bg-gray-50 text-gray-300 cursor-not-allowed'
        }`}
      >
        <span>+</span>
        <span>후보지 추가</span>
      </button>
    </div>
  )
}
