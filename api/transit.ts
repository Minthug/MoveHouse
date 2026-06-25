import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const params = new URLSearchParams(req.query as Record<string, string>)
  params.set('apiKey', process.env.ODSAY_API_KEY ?? '')

  const response = await fetch(`https://api.odsay.com/v1/api/searchPubTransPathT?${params}`, {
    headers: { Referer: 'http://localhost:5173' },
  })
  const data = await response.json()
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json(data)
}
