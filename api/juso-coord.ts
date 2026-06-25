import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const params = new URLSearchParams(req.query as Record<string, string>)
  params.set('confmKey', process.env.JUSO_COORD_KEY ?? '')
  params.set('resultType', 'json')

  const response = await fetch(`https://business.juso.go.kr/addrlink/addrCoordApi.do?${params}`)
  const data = await response.json()
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json(data)
}
