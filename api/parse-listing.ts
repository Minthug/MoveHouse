import type { VercelRequest, VercelResponse } from '@vercel/node'

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  })
  return res.text()
}

function decodeUnicode(str: string): string {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  )
}

async function parsePeterpanz(url: string) {
  const html = await fetchHtml(url)
  const m = html.match(/"road_address":\s*"((?:[^"\\]|\\.)*)"/)?.[1]
  if (!m) return null
  return decodeUnicode(m)
}

async function parseDabang(url: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

  if (url.includes('redirect.dabangapp.com')) {
    // redirect URL → 최종 URL에 m_lat/m_lng 좌표 포함
    const res = await fetch(url, { headers: { 'User-Agent': ua }, redirect: 'follow' })
    const finalUrl = new URL(res.url)
    const lat = parseFloat(finalUrl.searchParams.get('m_lat') ?? '')
    const lng = parseFloat(finalUrl.searchParams.get('m_lng') ?? '')
    if (!isNaN(lat) && !isNaN(lng)) {
      // 라벨은 방 상세 og:title에서 추출
      const detailId = finalUrl.searchParams.get('detail_id')
      let label = '다방 매물'
      if (detailId) {
        const roomHtml = await fetchHtml(`https://www.dabangapp.com/room/${detailId}`)
        const m = roomHtml.match(/og:title[^>]*content="([^"]+)"/)?.[1]
        if (m) label = m.replace(/^\[다방\]\s*/, '').split(',')[0].trim()
      }
      return { lat, lng, label }
    }
  }

  // 직접 room URL인 경우 → og:title에서 주소 파싱 (동 수준)
  const html = await fetchHtml(url)
  const m = html.match(/og:title[^>]*content="([^"]+)"/)?.[1]
  if (!m) return null
  const label = m.replace(/^\[다방\]\s*/, '').split(',')[0].trim()
  return label ? { lat: NaN, lng: NaN, label } : null
}

async function parseZigbang(url: string) {
  const html = await fetchHtml(url)
  const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)?.[1]
  if (!nextData) return null
  const data = JSON.parse(nextData)
  const ogTitle: string = data?.props?.pageProps?.meta?.ogTitle ?? ''
  // "강남구 매매 5억 9,800 빌라" → "강남구"만 추출 (상세주소 없음)
  const region = ogTitle.split(' ')[0] ?? null
  return region ? { address: null, hint: region } : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { url } = req.query
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url 파라미터가 필요합니다' })
  }

  try {
    if (url.includes('peterpanz.com')) {
      const address = await parsePeterpanz(url)
      if (!address) return res.json({ success: false, platform: 'peterpanz' })
      return res.json({ success: true, platform: 'peterpanz', address })
    }

    if (url.includes('dabangapp.com') || url.includes('dabang')) {
      const result = await parseDabang(url)
      if (!result) return res.json({ success: false, platform: 'dabang' })
      if (!isNaN(result.lat)) {
        // 정확한 좌표를 직접 반환 (redirect URL에서 추출)
        return res.json({ success: true, platform: 'dabang', lat: result.lat, lng: result.lng, label: result.label })
      }
      // 직접 room URL은 동 수준 주소만 가능
      return res.json({ success: true, platform: 'dabang', address: result.label, precision: 'neighborhood' })
    }

    if (url.includes('zigbang.com') || url.includes('zigbang')) {
      const result = await parseZigbang(url)
      if (!result) return res.json({ success: false, platform: 'zigbang' })
      // 직방은 상세주소 불가 → hint만 반환
      return res.json({ success: false, platform: 'zigbang', hint: (result as { hint: string }).hint })
    }

    return res.json({ success: false, error: '지원하지 않는 플랫폼이에요' })
  } catch (e) {
    return res.status(500).json({ success: false, error: String(e) })
  }
}
