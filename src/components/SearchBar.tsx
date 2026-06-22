import { useState } from 'react'

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  address: {
    road?: string
    suburb?: string
    city?: string
    town?: string
    borough?: string
  }
}

function formatAddress(item: NominatimResult): string {
  const a = item.address
  const parts = [
    a.road || a.suburb,
    a.borough,
    a.city || a.town,
  ].filter(Boolean)
  return parts.join(' ') || item.display_name
}

interface Props {
  placeholder: string
  onSelect: (lat: number, lng: number, address: string) => void
}

export default function SearchBar({ placeholder, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function search() {
    if (!query.trim()) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        countrycodes: 'kr',
        limit: '5',
        'accept-language': 'ko',
        addressdetails: '1',
      })
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
      const data: NominatimResult[] = await res.json()
      setResults(data)
      setOpen(data.length > 0)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(item: NominatimResult) {
    const lat = parseFloat(item.lat)
    const lng = parseFloat(item.lon)
    const address = formatAddress(item)
    onSelect(lat, lng, address)
    setQuery(address)
    setOpen(false)
    setResults([])
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder={placeholder}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button
          onClick={search}
          disabled={loading}
          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '검색'}
        </button>
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-[2000] top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((item) => (
            <button
              key={item.place_id}
              onClick={() => handleSelect(item)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
            >
              <div className="font-medium text-gray-800 truncate">
                {formatAddress(item)}
              </div>
              <div className="text-xs text-gray-400 truncate">{item.display_name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
