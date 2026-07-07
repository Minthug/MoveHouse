import { useState, useRef } from 'react'
import LocationCard from './LocationCard'
import SearchBar from './SearchBar'
import CompareAnalysis from './CompareAnalysis'
import type { AppMode, CandidateLocation, Destination } from '../types'
import { PLACE_CATEGORIES } from '../services/places'
import type { PlaceCategory, NearbyPlace } from '../services/places'

const MAX_CANDIDATES = 5

function KeywordPlaceSearch({
  onSearch,
  customPlaces,
  onClear,
}: {
  onSearch: (kw: string) => void
  customPlaces: NearbyPlace[]
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const kw = inputRef.current?.value.trim()
    if (!kw) return
    setLoading(true)
    await onSearch(kw)
    setLoading(false)
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-1.5">
        <input
          ref={inputRef}
          type="text"
          placeholder="직접 검색 (예: 헬스장, 어린이집)"
          className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-gray-400 bg-white"
        />
        <button
          type="submit"
          disabled={loading}
          className="text-xs px-3 py-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors shrink-0"
        >
          {loading ? '검색 중' : '검색'}
        </button>
      </form>
      {customPlaces.length > 0 && (
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-xs text-gray-400">검색 결과 {customPlaces.length}개</span>
          <button onClick={onClear} className="text-xs text-gray-300 hover:text-gray-500 transition-colors">
            지우기
          </button>
        </div>
      )}
    </div>
  )
}

interface Props {
  boardName: string
  onBackHome: () => void
  onRenameBoard: (name: string) => void
  destination: Destination | null
  destination2?: Destination | null
  candidates: CandidateLocation[]
  selectedCandidateId: string | null
  selectedRouteType: 'transit' | 'bus'
  onSelectCandidate: (id: string, routeType: 'transit' | 'bus') => void
  onDestinationSelect: (lat: number, lng: number, address: string) => void
  onDestination2Select: (lat: number, lng: number, address: string) => void
  onRemoveDestination2: () => void
  onCandidateSelect: (lat: number, lng: number, address: string) => void
  onRemoveCandidate: (id: string) => void
  onReset: () => void
  onShare: () => void
  activePlaceCategories: Set<PlaceCategory>
  loadingCategory: PlaceCategory | null
  onToggleCategory: (category: PlaceCategory) => void
  nearbyPlaces: NearbyPlace[]
  customPlaces: NearbyPlace[]
  onKeywordSearch: (keyword: string) => void
  onClearCustomPlaces: () => void
  onMemoChange: (id: string, memo: string) => void
  onRentChange: (id: string, rent: number | undefined) => void
}

export default function ComparePanel({
  boardName,
  onBackHome,
  onRenameBoard,
  destination,
  destination2,
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  onDestinationSelect,
  onDestination2Select,
  onRemoveDestination2,
  onCandidateSelect,
  onRemoveCandidate,
  onReset,
  onShare,
  selectedRouteType,
  activePlaceCategories,
  loadingCategory,
  onToggleCategory,
  nearbyPlaces,
  customPlaces,
  onKeywordSearch,
  onClearCustomPlaces,
  onMemoChange,
  onRentChange,
}: Props) {
  const [showAnalysis, setShowAnalysis] = useState(false)
  const readyCandidates = candidates.filter((c) => c.routes.transit && !c.loading)
  const canCompare = readyCandidates.length >= 2

  if (showAnalysis) {
    return (
      <CompareAnalysis
        candidates={candidates}
        hasDest2={!!destination2}
        selectedCandidateId={selectedCandidateId}
        onSelectCandidate={(id) => onSelectCandidate(id, 'transit')}
        onBack={() => setShowAnalysis(false)}
      />
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 border-l border-gray-200">
      {/* Header */}
      <div className="p-4 bg-white border-b border-gray-200 flex items-start justify-between">
        <div className="min-w-0">
          <button
            onClick={onBackHome}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-full transition-colors mb-2"
            title="비교 목록으로"
          >
            <span className="text-sm leading-none">‹</span> 내 비교 목록
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <h1 className="text-base font-bold text-gray-900 truncate">{boardName || '이사 통근 비교'}</h1>
            <button
              onClick={() => {
                const name = window.prompt('비교 이름', boardName)
                if (name != null && name.trim()) onRenameBoard(name.trim())
              }}
              className="shrink-0 text-gray-300 hover:text-gray-600 text-sm leading-none"
              title="이름 변경"
            >
              ✏️
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-0.5 shrink-0">
          {destination && candidates.length > 0 && (
            <button
              onClick={onShare}
              className="text-xs text-blue-400 hover:text-blue-600 transition-colors font-medium"
              title="비교 결과 공유"
            >
              링크 공유
            </button>
          )}
          {(destination || candidates.length > 0) && (
            <button
              onClick={() => {
                if (window.confirm('목적지와 후보지를 모두 초기화할까요?')) onReset()
              }}
              className="text-xs text-gray-300 hover:text-red-400 transition-colors"
              title="전체 초기화"
            >
              초기화
            </button>
          )}
        </div>
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

        {/* 두 번째 목적지 (다인 통근 비교) */}
        {destination && (
          destination2 ? (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: '#f0fdfa' }}>
              <span className="text-sm" style={{ color: '#0d9488' }}>★</span>
              <span className="text-sm truncate flex-1" style={{ color: '#0f766e' }}>{destination2.name}</span>
              <button
                onClick={onRemoveDestination2}
                className="text-gray-300 hover:text-gray-500 text-base leading-none transition-colors shrink-0"
                title="두 번째 목적지 제거"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="pt-0.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] shrink-0" style={{ background: '#0d9488' }}>★</span>
                <span className="text-xs font-medium text-gray-500">두 번째 목적지 (예: 배우자 회사)</span>
              </div>
              <SearchBar
                placeholder="두 번째 목적지 주소 (선택)"
                onSelect={onDestination2Select}
              />
            </div>
          )
        )}

        {destination && (
          <div className="pt-1 space-y-2">
            <p className="text-xs text-gray-400">목적지 + 후보지 주변 편의시설</p>

            {/* 프리셋 가로 스크롤 */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {(Object.entries(PLACE_CATEGORIES) as [PlaceCategory, typeof PLACE_CATEGORIES[PlaceCategory]][]).map(([code, cfg]) => {
                const active = activePlaceCategories.has(code)
                const count = nearbyPlaces.filter((p) => p.category === code).length
                return (
                  <button
                    key={code}
                    onClick={() => onToggleCategory(code)}
                    disabled={loadingCategory !== null}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all border shrink-0 disabled:cursor-wait ${
                      active ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                    style={active ? { background: cfg.color } : {}}
                  >
                    {loadingCategory === code ? (
                      <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>{cfg.emoji}</span>
                    )}
                    <span>{cfg.label}</span>
                    {active && count > 0 && <span className="bg-white/30 rounded-full px-1">{count}</span>}
                  </button>
                )
              })}
            </div>

            {/* 키워드 직접 검색 */}
            <KeywordPlaceSearch
              onSearch={onKeywordSearch}
              customPlaces={customPlaces}
              onClear={onClearCustomPlaces}
            />
          </div>
        )}
      </div>

      {/* Candidate search */}
      {destination && (
        <div className="p-4 border-b border-gray-200 bg-white space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">+</span>
            <span className="text-sm font-semibold text-gray-700">후보지 추가</span>
            {candidates.length > 0 && (
              <span className="text-xs text-gray-400">{candidates.length}/{MAX_CANDIDATES}</span>
            )}
          </div>
          {candidates.length < MAX_CANDIDATES ? (
            <SearchBar
              placeholder="후보지 주소 또는 매물 URL"
              onSelect={onCandidateSelect}
            />
          ) : (
            <p className="text-xs text-gray-400 text-center py-1">
              최대 {MAX_CANDIDATES}개까지 추가할 수 있어요
            </p>
          )}
        </div>
      )}

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
            selectedRouteType={selectedRouteType}
            hasDest2={!!destination2}
            onSelect={onSelectCandidate}
            onRemove={onRemoveCandidate}
            onMemoChange={onMemoChange}
            onRentChange={onRentChange}
          />
        ))}

        {canCompare && (
          <button
            onClick={() => setShowAnalysis(true)}
            className="w-full mt-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            📊 비교 분석하기
          </button>
        )}
      </div>

    </div>
  )
}
