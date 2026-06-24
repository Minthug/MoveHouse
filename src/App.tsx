import { useState, useCallback } from 'react'
import MapView from './components/MapView'
import ComparePanel from './components/ComparePanel'
import { useDirections } from './hooks/useDirections'
import type { AppMode, CandidateLocation, Destination } from './types'

const LABELS = ['A', 'B', 'C', 'D', 'E']

function makeId() {
  return Math.random().toString(36).slice(2, 9)
}

export default function App() {
  const [mode, setMode] = useState<AppMode>('set-destination')
  const [destination, setDestination] = useState<Destination | null>(null)
  const [candidates, setCandidates] = useState<CandidateLocation[]>([])
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const { fetchRoutes } = useDirections()

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

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="flex-1 relative">
        <MapView
          mode={mode}
          destination={destination}
          candidates={candidates}
          selectedCandidateId={selectedCandidateId}
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
        />
      </div>
    </div>
  )
}
