import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const params = new URLSearchParams(req.query as Record<string, string>)

  const response = await fetch(`https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving?${params}`, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID ?? '',
      'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET ?? '',
    },
  })
  const data = await response.json()
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json(data)
}
