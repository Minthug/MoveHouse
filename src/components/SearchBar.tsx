import { useState, useRef } from 'react'

interface NaverLocalItem {
  title: string
  address: string
  roadAddress: string
  mapx: string // lng × 10^7 (e.g. 1270368490 → 127.036849)
  mapy: string // lat × 10^7 (e.g.  374999810 →  37.499981)
}

function stripHtml(str: string) {
  return str.replace(/<[^>]*>/g, '')
}

interface Props {
  placeholder: string
  onSelect: (lat: number, lng: number, address: string) => void
}

export default function SearchBar({ placeholder, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NaverLocalItem[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function search() {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/geocode?query=${encodeURIComponent(q)}&display=5`)
      const data = await res.json()

      if (!res.ok) {
        setError('검색 중 오류가 발생했습니다')
        setResults([])
        setOpen(false)
        return
      }

      const items: NaverLocalItem[] = data.items ?? []
      setResults(items)
      setOpen(items.length > 0)
      if (items.length === 0) setError('검색 결과가 없습니다')
    } catch {
      setError('네트워크 오류')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(item: NaverLocalItem) {
    const lat = parseInt(item.mapy) / 1e7
    const lng = parseInt(item.mapx) / 1e7
    const address = item.roadAddress || item.address
    onSelect(lat, lng, stripHtml(address))
    setQuery(stripHtml(item.title))
    setOpen(false)
    setResults([])
    setError('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') search()
    if (e.key === 'Escape') { setOpen(false); setResults([]) }
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setError('') }}
          onKeyDown={handleKeyDown}
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

      {error && !open && (
        <p className="text-xs text-red-400 mt-1 px-1">{error}</p>
      )}

      {open && results.length > 0 && (
        <div className="absolute z-[2000] top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map((item, i) => (
            <button
              key={i}
              onClick={() => handleSelect(item)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors"
            >
              <div className="font-medium text-gray-800 truncate">
                {stripHtml(item.title)}
              </div>
              <div className="text-xs text-gray-400 truncate mt-0.5">
                {item.roadAddress || item.address}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
