import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import MapView from './components/MapView'
import ComparePanel from './components/ComparePanel'
import { useDirections } from './hooks/useDirections'
import { fetchNearbyPlaces, searchPlacesByKeyword, clearOverpassCache } from './services/places'
import type { PlaceCategory, NearbyPlace } from './services/places'
import type { AppMode, CandidateLocation, Destination } from './types'

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
  const [mode, setMode] = useState<AppMode>('set-destination')
  const [destination, setDestination] = useState<Destination | null>(
    () => readLocal('commute-destination', null),
  )
  const [candidates, setCandidates] = useState<CandidateLocation[]>(
    () => readLocal<CandidateLocation[]>('commute-candidates', []).map((c) => ({
      ...c,
      loading: !c.routes.transit && !c.error,
    })),
  )
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [activePlaceCategories, setActivePlaceCategories] = useState<Set<PlaceCategory>>(new Set())
  const [loadingCategory, setLoadingCategory] = useState<PlaceCategory | null>(null)
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([])
  const [customPlaces, setCustomPlaces] = useState<NearbyPlace[]>([])
  const didRestoreRef = useRef(false)

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

  // 후보지 변경 시 활성 카테고리 자동 갱신
  const candidateKey = candidates.map((c) => c.id).join(',')
  useEffect(() => {
    if (activePlaceCategories.size === 0 || !destination) return
    const locations = [
      { lat: destination.lat, lng: destination.lng, id: destination.id },
      ...candidates.map((c) => ({ lat: c.lat, lng: c.lng, id: c.id })),
    ]
    const categories = [...activePlaceCategories]
    Promise.all(categories.map((cat) => fetchNearbyPlaces(locations, cat))).then((batches) =>
      setNearbyPlaces(batches.flat()),
    )
  }, [candidateKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // localStorage 동기화
  useEffect(() => { writeLocal('commute-destination', destination) }, [destination])
  useEffect(() => {
    writeLocal('commute-candidates', candidates.map((c) => ({ ...c, loading: false })))
  }, [candidates])

  // 복원 후 경로 없는 후보지 재조회
  useEffect(() => {
    if (didRestoreRef.current || !destination) return
    didRestoreRef.current = true
    const pending = candidates.filter((c) => !c.routes.transit && !c.error)
    if (pending.length === 0) return
    for (const c of pending) {
      fetchRoutes({ lat: c.lat, lng: c.lng }, destination)
        .then((routes) => setCandidates((prev) =>
          prev.map((p) => p.id === c.id ? { ...p, loading: false, routes } : p),
        ))
        .catch(() => setCandidates((prev) =>
          prev.map((p) => p.id === c.id ? { ...p, loading: false, error: '경로를 가져오지 못했어요' } : p),
        ))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function addCandidate(lat: number, lng: number, name: string, dest: Destination) {
    if (candidates.length >= 5) return
    // Prevent duplicate districts
    if (candidates.some((c) => c.name === name)) return

    const id = makeId()
    const label = LABELS[candidates.length]

    setCandidates((prev) => [...prev, { id, lat, lng, name, label, routes: {}, loading: true }])

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
  }

  const handleDistrictClick = useCallback(
    (name: string, lat: number, lng: number) => {
      if (mode === 'set-destination') {
        setDestination({ id: makeId(), lat, lng, name, type: 'work' })
      } else if (mode === 'add-candidate' && destination) {
        // Don't add if it's already the destination district
        if (destination.name === name) return
        addCandidate(lat, lng, name, destination)
      }
    },
    [mode, destination, candidates.length], // eslint-disable-line react-hooks/exhaustive-deps
  )

  function handleDestinationSelect(lat: number, lng: number, address: string) {
    setDestination({ id: makeId(), lat, lng, name: address, type: 'work' })
  }

  function handleCandidateSelect(lat: number, lng: number, address: string) {
    if (destination) addCandidate(lat, lng, address, destination)
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
        ...candidates.map((c) => ({ lat: c.lat, lng: c.lng, id: c.id })),
      ]
      const places = await fetchNearbyPlaces(locations, category)
      setLoadingCategory(null)
      setNearbyPlaces((prev) => [...prev.filter((p) => p.category !== category), ...places])
    }
  }

  function handleReset() {
    setDestination(null)
    setCandidates([])
    setSelectedCandidateId(null)
    setMode('set-destination')
    localStorage.removeItem('commute-destination')
    localStorage.removeItem('commute-candidates')
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="flex-1 relative">
        <MapView
          mode={mode}
          destination={destination}
          candidates={candidates}
          selectedCandidateId={selectedCandidateId}
          nearbyPlaces={allNearbyPlaces}
          onDistrictClick={handleDistrictClick}
        />
      </div>
      <div className="w-[360px] shrink-0 flex flex-col overflow-hidden">
        <ComparePanel
          mode={mode}
          onModeChange={setMode}
          destination={destination}
          candidates={candidates}
          selectedCandidateId={selectedCandidateId}
          onSelectCandidate={(id) => setSelectedCandidateId((prev) => prev === id ? null : id)}
          onDestinationSelect={handleDestinationSelect}
          onCandidateSelect={handleCandidateSelect}
          onRemoveCandidate={handleRemoveCandidate}
          onReset={handleReset}
          activePlaceCategories={activePlaceCategories}
          loadingCategory={loadingCategory}
          onToggleCategory={handleToggleCategory}
          nearbyPlaces={nearbyPlaces}
          customPlaces={customPlaces}
          onKeywordSearch={handleKeywordSearch}
          onClearCustomPlaces={() => setCustomPlaces([])}
        />
      </div>
    </div>
  )
}
