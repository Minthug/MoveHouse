import { useState, useRef } from 'react'
import proj4 from 'proj4'
import { apiUrl } from '../lib/api'

// UTMK (EPSG:5179) 정의 — Juso 좌표 API가 이 좌표계로 반환
proj4.defs(
  'EPSG:5179',
  '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9999 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs',
)

function utmkToWgs84(x: number, y: number): { lat: number; lng: number } {
  const [lng, lat] = proj4('EPSG:5179', 'WGS84', [x, y])
  return { lat, lng }
}

interface JusoItem {
  roadAddr: string
  roadAddrPart1: string
  jibunAddr: string
  zipNo: string
  bdNm: string
  admCd: string
  rnMgtSn: string
  udrtYn: string
  buldMnnm: string
  buldSlno: string
  entX: string
  entY: string
}

interface Props {
  placeholder: string
  onSelect: (lat: number, lng: number, address: string) => void
}

async function fetchCoord(item: JusoItem): Promise<{ lat: number; lng: number } | null> {
  try {
    const params = new URLSearchParams({
      admCd: item.admCd,
      rnMgtSn: item.rnMgtSn,
      udrtYn: item.udrtYn,
      buldMnnm: item.buldMnnm,
      buldSlno: item.buldSlno,
    })
    const res = await fetch(apiUrl(`/api/juso-coord?${params}`))
    const data = await res.json()
    const juso = data?.results?.juso?.[0]
    if (!juso?.entX || !juso?.entY) return null
    return utmkToWgs84(parseFloat(juso.entX), parseFloat(juso.entY))
  } catch {
    return null
  }
}

function isListingUrl(q: string) {
  return /^https?:\/\/(www\.)?(peterpanz\.com|dabangapp\.com|redirect\.dabangapp\.com|zigbang\.com|sp\.zigbang\.com)/.test(q)
}

export default function SearchBar({ placeholder, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<JusoItem[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function searchByUrl(url: string) {
    setLoading(true)
    setError('URL에서 주소 가져오는 중...')
    try {
      const res = await fetch(apiUrl(`/api/parse-listing?url=${encodeURIComponent(url)}`))
      const data = await res.json()

      if (data.success && data.lat != null && data.lng != null) {
        // 다방 redirect URL: 좌표 직접 반환
        onSelect(data.lat, data.lng, data.label ?? '다방 매물')
        setQuery('')
        setError('')
        return
      }

      if (data.success && data.address) {
        // 피터팬 등: 주소 → Juso → 좌표 변환
        const jusoRes = await fetch(apiUrl(`/api/juso?keyword=${encodeURIComponent(data.address)}&currentPage=1&countPerPage=1`))
        const jusoData = await jusoRes.json()
        const juso = jusoData?.results?.juso?.[0]
        if (juso) {
          const coordRes = await fetch(apiUrl(`/api/juso-coord?admCd=${juso.admCd}&rnMgtSn=${juso.rnMgtSn}&udrtYn=${juso.udrtYn}&buldMnnm=${juso.buldMnnm}&buldSlno=${juso.buldSlno}`))
          const coordData = await coordRes.json()
          const coord = coordData?.results?.juso?.[0]
          if (coord?.entX && coord?.entY) {
            const { lat, lng } = utmkToWgs84(parseFloat(coord.entX), parseFloat(coord.entY))
            const label = juso.bdNm ? `${juso.roadAddr} (${juso.bdNm})` : juso.roadAddr
            onSelect(lat, lng, label)
            setQuery('')
            setError(data.precision === 'neighborhood' ? '동 수준 주소예요. 위치가 정확하지 않을 수 있어요.' : '')
            return
          }
        }
        setError(`주소 좌표 변환 실패: ${data.address}`)
        return
      }

      if (data.hint) {
        setError(`직방은 "${data.hint}" 지역만 확인됐어요. 주소를 직접 검색해주세요.`)
        return
      }

      setError(data.error ?? '주소를 가져오지 못했어요')
    } catch (e) {
      setError(`오류: ${String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  async function search() {
    // DOM에서 직접 읽어 state timing 이슈 방지
    const q = (inputRef.current?.value ?? query).trim()
    if (!q) return

    if (isListingUrl(q)) {
      setQuery(q)
      await searchByUrl(q)
      return
    }

    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ keyword: q, currentPage: '1', countPerPage: '7' })
      const res = await fetch(apiUrl(`/api/juso?${params}`))
      const data = await res.json()
      const errCode = data?.results?.common?.errorCode
      if (errCode && errCode !== '0') {
        setError('검색 중 오류가 발생했습니다')
        setResults([])
        setOpen(false)
        return
      }
      const items: JusoItem[] = data?.results?.juso ?? []
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

  async function handleSelect(item: JusoItem) {
    const label = item.bdNm ? `${item.roadAddr} (${item.bdNm})` : item.roadAddr
    setQuery(label)
    setOpen(false)
    setResults([])
    setError('')

    // entX/entY 직접 제공 시 사용, 아니면 coord API 호출
    const directLat = parseFloat(item.entY)
    const directLng = parseFloat(item.entX)
    if (directLat && directLng) {
      onSelect(directLat, directLng, label)
      return
    }

    const coord = await fetchCoord(item)
    if (coord) {
      onSelect(coord.lat, coord.lng, label)
    } else {
      setError('좌표를 가져오지 못했습니다')
    }
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
        <p className={`text-xs mt-1 px-1 ${
          error.includes('중...') ? 'text-blue-400' :
          error.includes('수준') || error.includes('직방') ? 'text-yellow-500' :
          'text-red-400'
        }`}>{error}</p>
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
                {item.bdNm ? `${item.roadAddrPart1} (${item.bdNm})` : item.roadAddrPart1}
              </div>
              <div className="text-xs text-gray-400 truncate mt-0.5">
                {item.jibunAddr} · {item.zipNo}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
