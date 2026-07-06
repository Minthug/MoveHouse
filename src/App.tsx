import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import SeoulMap from './components/SeoulMap'
import ComparePanel from './components/ComparePanel'
import { useDirections } from './hooks/useDirections'
import { fetchNearbyPlaces, searchPlacesByKeyword, clearOverpassCache } from './services/places'
import type { PlaceCategory, NearbyPlace } from './services/places'
import type { AppMode, CandidateLocation, Destination } from './types'
import { encodeShare, decodeShare } from './lib/share'

const LABELS = ['A', 'B', 'C', 'D', 'E']

function makeId() {
  return Math.random().toString(36).slice(2, 9)
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

export default function App() {
  const [destination, setDestination] = useState<Destination | null>(() => {
    const shared = decodeShare()
    if (shared) return { id: makeId(), ...shared.dest }
    return readLocal('commute-destination', null)
  })
  const [destination2, setDestination2] = useState<Destination | null>(() => {
    const shared = decodeShare()
    if (shared) return shared.dest2 ? { id: makeId(), ...shared.dest2 } : null
    return readLocal('commute-destination2', null)
  })
  const [candidates, setCandidates] = useState<CandidateLocation[]>(() => {
    const shared = decodeShare()
    if (shared) {
      return shared.cands.map((c) => ({
        id: makeId(), ...c, loading: false,
      }))
    }
    return readLocal<CandidateLocation[]>('commute-candidates', []).map((c) => ({
      ...c,
      loading: !c.routes.transit && !c.error,
    }))
  })
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [selectedRouteType, setSelectedRouteType] = useState<'transit' | 'bus'>('transit')
  const [activePlaceCategories, setActivePlaceCategories] = useState<Set<PlaceCategory>>(new Set())
  const [loadingCategory, setLoadingCategory] = useState<PlaceCategory | null>(null)
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([])
  const [customPlaces, setCustomPlaces] = useState<NearbyPlace[]>([])
  const didRestoreRef = useRef(false)
  const mode: AppMode = destination ? 'add-candidate' : 'set-destination'

  const allNearbyPlaces = useMemo(
    () => [...nearbyPlaces, ...customPlaces],
    [nearbyPlaces, customPlaces],
  )
  const { fetchRoutes } = useDirections()

  // 목적지 바뀌면 편의시설 초기화 + 캐시 무효화
  useEffect(() => {
    setNearbyPlaces([])
    setCustomPlaces([])
    setActivePlaceCategories(new Set())
    clearOverpassCache()
  }, [destination?.id])

  // 후보지/목적지 변경 시 활성 카테고리 자동 갱신
  const candidateKey = candidates.map((c) => c.id).join(',') + '|' + (destination2?.id ?? '')
  useEffect(() => {
    if (activePlaceCategories.size === 0 || !destination) return
    const locations = [
      { lat: destination.lat, lng: destination.lng, id: destination.id },
      ...(destination2 ? [{ lat: destination2.lat, lng: destination2.lng, id: destination2.id }] : []),
      ...candidates.map((c) => ({ lat: c.lat, lng: c.lng, id: c.id })),
    ]
    const categories = [...activePlaceCategories]
    Promise.all(categories.map((cat) => fetchNearbyPlaces(locations, cat))).then((batches) =>
      setNearbyPlaces(batches.flat()),
    )
  }, [candidateKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // localStorage 동기화
  useEffect(() => { writeLocal('commute-destination', destination) }, [destination])
  useEffect(() => { writeLocal('commute-destination2', destination2) }, [destination2])
  useEffect(() => {
    writeLocal('commute-candidates', candidates.map((c) => ({ ...c, loading: false })))
  }, [candidates])

  // 복원 후 경로 없는 후보지 재조회 + 버스 미조회(undefined) 후보지 백그라운드 업데이트
  useEffect(() => {
    if (didRestoreRef.current || !destination) return
    didRestoreRef.current = true

    // transit 없는 후보지: 전체 재조회
    const noTransit = candidates.filter((c) => !c.routes.transit && !c.error)
    for (const c of noTransit) {
      fetchRoutes({ lat: c.lat, lng: c.lng }, destination)
        .then((routes) => setCandidates((prev) =>
          prev.map((p) => p.id === c.id ? { ...p, loading: false, routes } : p),
        ))
        .catch(() => setCandidates((prev) =>
          prev.map((p) => p.id === c.id ? { ...p, loading: false, error: '경로를 가져오지 못했어요' } : p),
        ))
    }

    // transit 있지만 bus가 undefined(= 기능 추가 전 데이터): 버스만 백그라운드 조회
    const noBus = candidates.filter((c) => c.routes.transit && c.routes.bus === undefined && !c.error)
    for (const c of noBus) {
      fetchRoutes({ lat: c.lat, lng: c.lng }, destination)
        .then((routes) => setCandidates((prev) =>
          prev.map((p) => p.id === c.id ? { ...p, routes: { ...p.routes, bus: routes.bus } } : p),
        ))
        .catch(() => {})
    }

    // 보조 목적지가 있는데 routes2 없는 후보지: routes2 재조회
    if (destination2) {
      const noRoutes2 = candidates.filter((c) => !c.routes2?.transit && !c.error2)
      for (const c of noRoutes2) {
        fetchRoutes({ lat: c.lat, lng: c.lng }, destination2)
          .then((routes2) => setCandidates((prev) =>
            prev.map((p) => p.id === c.id ? { ...p, loading2: false, routes2 } : p),
          ))
          .catch(() => setCandidates((prev) =>
            prev.map((p) => p.id === c.id ? { ...p, loading2: false, error2: '경로를 가져오지 못했어요' } : p),
          ))
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function addCandidate(lat: number, lng: number, name: string, dest: Destination) {
    if (candidates.length >= 5) return
    // Prevent duplicate districts
    if (candidates.some((c) => c.name === name)) return

    const id = makeId()
    const label = LABELS[candidates.length]

    const hasDest2 = !!destination2
    setCandidates((prev) => [...prev, { id, lat, lng, name, label, routes: {}, loading: true, loading2: hasDest2 }])

    fetchRoutes({ lat, lng }, dest)
      .then((routes) => {
        setCandidates((prev) =>
          prev.map((c) => (c.id === id ? { ...c, loading: false, routes } : c)),
        )
      })
      .catch(() => {
        setCandidates((prev) =>
          prev.map((c) =>
            c.id === id ? { ...c, loading: false, error: '경로를 가져오지 못했어요' } : c,
          ),
        )
      })

    if (destination2) {
      fetchRoutes({ lat, lng }, destination2)
        .then((routes2) => {
          setCandidates((prev) =>
            prev.map((c) => (c.id === id ? { ...c, loading2: false, routes2 } : c)),
          )
        })
        .catch(() => {
          setCandidates((prev) =>
            prev.map((c) =>
              c.id === id ? { ...c, loading2: false, error2: '경로를 가져오지 못했어요' } : c,
            ),
          )
        })
    }
  }

  // 보조 목적지 설정: 기존 후보지 전체에 대해 routes2 재조회
  function setDestination2AndFetch(dest2: Destination) {
    setDestination2(dest2)
    setCandidates((prev) => prev.map((c) => ({ ...c, loading2: true, routes2: undefined, error2: undefined })))
    candidates.forEach((c) => {
      fetchRoutes({ lat: c.lat, lng: c.lng }, dest2)
        .then((routes2) => setCandidates((prev) =>
          prev.map((p) => p.id === c.id ? { ...p, loading2: false, routes2 } : p),
        ))
        .catch(() => setCandidates((prev) =>
          prev.map((p) => p.id === c.id ? { ...p, loading2: false, error2: '경로를 가져오지 못했어요' } : p),
        ))
    })
  }

  function handleRemoveDestination2() {
    setDestination2(null)
    setCandidates((prev) => prev.map((c) => ({ ...c, routes2: undefined, loading2: false, error2: undefined })))
  }

  const handleDistrictClick = useCallback(
    (name: string, lat: number, lng: number) => {
      if (!destination) {
        setDestination({ id: makeId(), lat, lng, name, type: 'work' })
      } else {
        if (destination.name === name) return
        addCandidate(lat, lng, name, destination)
      }
    },
    [destination, candidates.length], // eslint-disable-line react-hooks/exhaustive-deps
  )

  function handleDestinationSelect(lat: number, lng: number, address: string) {
    setDestination({ id: makeId(), lat, lng, name: address, type: 'work' })
  }

  function handleCandidateSelect(lat: number, lng: number, address: string) {
    if (destination) addCandidate(lat, lng, address, destination)
  }

  function handleDestination2Select(lat: number, lng: number, address: string) {
    setDestination2AndFetch({ id: makeId(), lat, lng, name: address, type: 'work' })
  }

  function handleRemoveCandidate(id: string) {
    setCandidates((prev) => {
      const filtered = prev.filter((c) => c.id !== id)
      return filtered.map((c, i) => ({ ...c, label: LABELS[i] }))
    })
  }

  async function handleKeywordSearch(keyword: string) {
    if (!destination || !keyword.trim()) return
    const locations = [
      { lat: destination.lat, lng: destination.lng, name: destination.name, id: destination.id },
      ...(destination2 ? [{ lat: destination2.lat, lng: destination2.lng, name: destination2.name, id: destination2.id }] : []),
      ...candidates.map((c) => ({ lat: c.lat, lng: c.lng, name: c.name, id: c.id })),
    ]
    const batches = await Promise.all(
      locations.map((loc) => searchPlacesByKeyword(keyword, loc.lat, loc.lng, loc.name, 3000, loc.id)),
    )
    const seen = new Set<string>()
    const deduped = batches.flat().filter((p) => {
      if (seen.has(p.name)) return false
      seen.add(p.name)
      return true
    })
    setCustomPlaces(deduped)
  }

  async function handleToggleCategory(category: PlaceCategory) {
    if (!destination) return
    const next = new Set(activePlaceCategories)
    if (next.has(category)) {
      next.delete(category)
      setActivePlaceCategories(next)
      setNearbyPlaces((prev) => prev.filter((p) => p.category !== category))
    } else {
      next.add(category)
      setActivePlaceCategories(next)
      setLoadingCategory(category)
      const locations = [
        { lat: destination.lat, lng: destination.lng, id: destination.id },
        ...(destination2 ? [{ lat: destination2.lat, lng: destination2.lng, id: destination2.id }] : []),
        ...candidates.map((c) => ({ lat: c.lat, lng: c.lng, id: c.id })),
      ]
      const places = await fetchNearbyPlaces(locations, category)
      setLoadingCategory(null)
      setNearbyPlaces((prev) => [...prev.filter((p) => p.category !== category), ...places])
    }
  }

  function handleMemoChange(id: string, memo: string) {
    setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, memo } : c))
  }

  function handleRentChange(id: string, rent: number | undefined) {
    setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, rent } : c))
  }

  function handleReset() {
    setDestination(null)
    setDestination2(null)
    setCandidates([])
    setSelectedCandidateId(null)
    localStorage.removeItem('commute-destination')
    localStorage.removeItem('commute-destination2')
    localStorage.removeItem('commute-candidates')
    window.history.replaceState(null, '', window.location.pathname)
  }

  function handleShare() {
    if (!destination || candidates.length === 0) return
    const url = encodeShare(destination, candidates, destination2)
    navigator.clipboard.writeText(url).then(() => {
      alert('공유 링크가 클립보드에 복사됐어요!')
    }).catch(() => {
      prompt('아래 링크를 복사하세요:', url)
    })
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="flex-1 relative">
        <SeoulMap
          mode={mode}
          destination={destination}
          destination2={destination2}
          candidates={candidates}
          selectedCandidateId={selectedCandidateId}
          selectedRouteType={selectedRouteType}
          nearbyPlaces={allNearbyPlaces}
          onDistrictClick={handleDistrictClick}
        />
      </div>
      <div className="w-[360px] shrink-0 flex flex-col overflow-hidden">
        <ComparePanel
          destination={destination}
          destination2={destination2}
          candidates={candidates}
          selectedCandidateId={selectedCandidateId}
          selectedRouteType={selectedRouteType}
          onSelectCandidate={(id, routeType) => {
            const isSameIdAndType = selectedCandidateId === id && selectedRouteType === routeType
            setSelectedCandidateId(isSameIdAndType ? null : id)
            if (!isSameIdAndType) setSelectedRouteType(routeType)
          }}
          onDestinationSelect={handleDestinationSelect}
          onDestination2Select={handleDestination2Select}
          onRemoveDestination2={handleRemoveDestination2}
          onCandidateSelect={handleCandidateSelect}
          onRemoveCandidate={handleRemoveCandidate}
          onReset={handleReset}
          onShare={handleShare}
          activePlaceCategories={activePlaceCategories}
          loadingCategory={loadingCategory}
          onToggleCategory={handleToggleCategory}
          nearbyPlaces={nearbyPlaces}
          customPlaces={customPlaces}
          onKeywordSearch={handleKeywordSearch}
          onClearCustomPlaces={() => setCustomPlaces([])}
          onMemoChange={handleMemoChange}
          onRentChange={handleRentChange}
        />
      </div>
    </div>
  )
}
