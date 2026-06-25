import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const params = new URLSearchParams(req.query as Record<string, string>)

  const response = await fetch(`https://openapi.naver.com/v1/search/local.json?${params}`, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_DEV_CLIENT_ID ?? '',
      'X-Naver-Client-Secret': process.env.NAVER_DEV_CLIENT_SECRET ?? '',
    },
  })
  const data = await response.json()
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json(data)
}
