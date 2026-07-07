import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

export const config = { api: { bodyParser: false } }

// KV 미설정/실패 시 클라이언트가 인라인 링크로 폴백하도록 503 반환
function kvReady(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

function randomId(len = 8): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return s
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (!kvReady()) { res.status(503).json({ error: 'kv-not-configured' }); return }

  try {
    if (req.method === 'POST') {
      const chunks: Buffer[] = []
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
        req.on('end', resolve)
        req.on('error', reject)
      })
      const body = Buffer.concat(chunks).toString('utf-8')
      if (!body || body.length > 8000) { res.status(400).json({ error: 'bad-body' }); return }
      const id = randomId()
      // 180일 보관
      await kv.set(`share:${id}`, body, { ex: 60 * 60 * 24 * 180 })
      res.status(200).json({ id })
      return
    }
    if (req.method === 'GET') {
      const id = String(req.query.id ?? '')
      if (!/^[a-z0-9]{4,16}$/.test(id)) { res.status(400).json({ error: 'bad-id' }); return }
      const data = await kv.get<string>(`share:${id}`)
      if (data == null) { res.status(404).json({ error: 'not-found' }); return }
      res.setHeader('Content-Type', 'application/json')
      res.status(200).send(typeof data === 'string' ? data : JSON.stringify(data))
      return
    }
    res.status(405).end()
  } catch {
    res.status(503).json({ error: 'kv-error' })
  }
}
