// サンプル backend: POST /route（Jev はここからだけ呼ぶ）+ dist/web の静的配信
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { handleRoute } from './handler'
import { callJev } from '../ext/jevClient'

const key = process.env.TYPESAFE_API_KEY ?? ''
const port = Number(process.env.PORT ?? 8787)
const webDir = join(process.cwd(), 'dist', 'web')
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.map': 'application/json' }

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/route') {
    let body = ''
    for await (const chunk of req) body += chunk
    const r = await handleRoute(body, (s, q) => callJev(key, s, q))
    res.writeHead(r.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(r.body))
    return
  }
  const path = req.url === '/' ? '/index.html' : (req.url ?? '/')
  try {
    const data = await readFile(join(webDir, path))
    res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' }).end(data)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(port, () => console.log(`http://localhost:${port}  (Jev key: ${key ? 'set' : 'MISSING — .env を確認'})`))
