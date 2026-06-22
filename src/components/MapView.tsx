import { useRef } from 'react'
import { useLeafletMap } from '../hooks/useLeafletMap'
import type { Destination, CandidateLocation, AppMode } from '../types'

interface Props {
  mode: AppMode
  destination: Destination | null
  candidates: CandidateLocation[]
  onDistrictClick: (name: string, lat: number, lng: number) => void
}

export default function MapView({ mode, destination, candidates, onDistrictClick }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null)

  const { zoomedGu, onBack } = useLeafletMap({
    mapContainerRef,
    mode,
    destination,
    candidates,
    onDistrictClick,
  })

  return (
    <div className="relative w-full h-full bg-[#f5f8fb]">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Top-left: title + 뒤로가기 */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2">
        {zoomedGu ? (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 bg-white text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full shadow-md hover:bg-gray-50 transition-colors"
          >
            <span>←</span>
            <span>서울 전체</span>
          </button>
        ) : (
          <span className="text-xs text-gray-500 bg-white/80 px-2 py-1 rounded">
            서울특별시 행정 지도
          </span>
        )}

        {zoomedGu && (
          <span className="text-sm font-semibold text-gray-800 bg-white/90 px-3 py-1.5 rounded-full shadow-sm">
            {zoomedGu}
          </span>
        )}
      </div>

      {/* Bottom pill hint */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 pointer-events-none z-[1000]">
        {!zoomedGu && mode === 'set-destination' && (
          <div className="bg-red-500 text-white text-sm px-5 py-2.5 rounded-full shadow-lg whitespace-nowrap">
            구를 클릭해서 목적지를 설정하세요
          </div>
        )}
        {!zoomedGu && mode === 'add-candidate' && (
          <div className="bg-blue-500 text-white text-sm px-5 py-2.5 rounded-full shadow-lg whitespace-nowrap">
            구를 클릭해서 후보지를 추가하세요
          </div>
        )}
        {zoomedGu && (
          <div className="bg-white/90 text-gray-600 text-xs px-4 py-2 rounded-full shadow">
            동 경계를 보고 있습니다 · 뒤로가기로 전체 지도로 돌아가세요
          </div>
        )}
      </div>
    </div>
  )
}
