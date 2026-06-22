import { useRef, useState } from 'react'
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
  const [showSubway, setShowSubway] = useState(false)

  const { zoomedGu, onBack } = useLeafletMap({
    mapContainerRef,
    mode,
    destination,
    candidates,
    onDistrictClick,
    showSubway,
  })

  return (
    <div className="relative w-full h-full bg-[#f5f8fb]">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Top-left: title / 뒤로가기 + 구 이름 */}
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

      {/* Top-right: 전철 노선도 토글 */}
      <div className="absolute top-3 right-3 z-[1000]">
        <button
          onClick={() => setShowSubway((v) => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shadow-md transition-all ${
            showSubway
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <span>🚇</span>
          <span>전철 노선도</span>
        </button>
      </div>

      {/* Subway legend */}
      {showSubway && (
        <div className="absolute top-12 right-3 z-[1000] bg-white/95 rounded-xl shadow-lg p-3 text-xs space-y-1.5 min-w-[120px]">
          {[
            { name: '1호선', color: '#0052A4' },
            { name: '2호선', color: '#00A84D' },
            { name: '3호선', color: '#EF7C1C' },
            { name: '4호선', color: '#00A5DE' },
            { name: '5호선', color: '#996CAC' },
            { name: '6호선', color: '#CD7C2F' },
            { name: '7호선', color: '#747F00' },
            { name: '8호선', color: '#E6186C' },
            { name: '9호선', color: '#BDB092' },
            { name: '신분당선', color: '#D31145' },
            { name: '공항철도', color: '#0090D2' },
          ].map((line) => (
            <div key={line.name} className="flex items-center gap-2">
              <span
                className="inline-block w-6 h-1.5 rounded-full"
                style={{ background: line.color }}
              />
              <span className="text-gray-700">{line.name}</span>
            </div>
          ))}
        </div>
      )}

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
