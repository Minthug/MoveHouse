import LocationCard from './LocationCard'
import ModeToggle from './ModeToggle'
import SearchBar from './SearchBar'
import type { AppMode, CandidateLocation, Destination } from '../types'

const MAX_CANDIDATES = 5

interface Props {
  mode: AppMode
  onModeChange: (mode: AppMode) => void
  destination: Destination | null
  candidates: CandidateLocation[]
  selectedCandidateId: string | null
  onSelectCandidate: (id: string) => void
  onDestinationSelect: (lat: number, lng: number, address: string) => void
  onCandidateSelect: (lat: number, lng: number, address: string) => void
  onRemoveCandidate: (id: string) => void
}

export default function ComparePanel({
  mode,
  onModeChange,
  destination,
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  onDestinationSelect,
  onCandidateSelect,
  onRemoveCandidate,
}: Props) {
  return (
    <div className="flex flex-col h-full bg-gray-50 border-l border-gray-200">
      {/* Header */}
      <div className="p-4 bg-white border-b border-gray-200">
        <h1 className="text-base font-bold text-gray-900 mb-1">이사 통근 비교</h1>
        <p className="text-xs text-gray-400">
          목적지와 이사 후보지를 찍으면 교통 시간을 한눈에 비교해드려요
        </p>
      </div>

      {/* Destination section */}
      <div className="p-4 bg-white border-b border-gray-200 space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">★</span>
          <span className="text-sm font-semibold text-gray-700">목적지 (회사/학교)</span>
        </div>

        <SearchBar
          placeholder="주소 검색 또는 지도에서 클릭"
          onSelect={onDestinationSelect}
        />

        {destination && (
          <div className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2">
            <span className="text-red-500 text-sm">★</span>
            <span className="text-sm text-red-700 truncate flex-1">{destination.name}</span>
          </div>
        )}
      </div>

      {/* Mode toggle */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <ModeToggle
          mode={mode}
          onChange={onModeChange}
          canAddCandidate={!!destination && candidates.length < MAX_CANDIDATES}
        />
        {mode === 'add-candidate' && candidates.length < MAX_CANDIDATES && (
          <SearchBar
            placeholder="후보지 주소 검색"
            onSelect={onCandidateSelect}
          />
        )}
        {candidates.length >= MAX_CANDIDATES && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            최대 {MAX_CANDIDATES}개까지 추가할 수 있어요
          </p>
        )}
      </div>

      {/* Candidates list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {candidates.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="text-4xl mb-3">🏠</div>
            <p className="text-sm font-medium text-gray-500">후보지를 추가해보세요</p>
            <p className="text-xs text-gray-400 mt-1">
              {destination
                ? '지도를 클릭하거나 주소를 검색하세요'
                : '먼저 목적지(회사/학교)를 설정하세요'}
            </p>
          </div>
        )}

        {candidates.map((c, i) => (
          <LocationCard
            key={c.id}
            candidate={c}
            index={i}
            selected={selectedCandidateId === c.id}
            onSelect={onSelectCandidate}
            onRemove={onRemoveCandidate}
          />
        ))}
      </div>

    </div>
  )
}
