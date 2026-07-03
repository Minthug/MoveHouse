import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = {
  api: { bodyParser: false },
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).end(); return }

  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    req.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
    req.on('end', resolve)
    req.on('error', reject)
  })
  const query = Buffer.concat(chunks).toString('utf-8')

  const body = new URLSearchParams()
  body.set('data', query)

  const upstream = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // overpass-api.de는 UA 없는/브라우저 UA 요청을 406으로 차단 → 식별용 UA 필수
      'User-Agent': 'commute-compare/1.0 (https://move-house.vercel.app)',
    },
    body: body.toString(),
  })

  const text = await upstream.text()
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  res.status(upstream.status).send(text)
}
