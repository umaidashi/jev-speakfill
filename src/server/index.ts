// サンプル backend: POST /route（Jev はここからだけ呼ぶ）+ dist/web の静的配信
import { createServer } from 'node:http'
import { readFile, appendFile, mkdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { handleRoute } from './handler'
import { callJev } from '../ext/jevClient'

const key = process.env.TYPESAFE_API_KEY ?? ''
const port = Number(process.env.PORT ?? 8787)
const webDir = join(process.cwd(), 'dist', 'web')
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.map': 'application/json' }
const logFile = process.env.TRACE_LOG ?? 'logs/traces.jsonl'   // 発話ごとの Trace を 1 行ずつ追記（tail -f で追える）
await mkdir('logs', { recursive: true })
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return }
  if (req.method === 'POST' && req.url === '/route') {
    let body = ''
    for await (const chunk of req) body += chunk
    const r = await handleRoute(body, (s, q) => callJev(key, s, q))
    res.writeHead(r.status, { 'Content-Type': 'application/json', ...cors }).end(JSON.stringify(r.body))
    if (r.status === 200) {
      const t = r.body.trace
      await appendFile(logFile, JSON.stringify({ ...t, wall: new Date().toISOString() }) + '\n')
      const fmt = (ps: { fieldId: string; value: string }[]) => ps.map((p) => `${t.gate ? p.fieldId : ''}=${p.value}`).join(', ')
      console.log(`[${new Date().toLocaleTimeString('ja-JP', { hour12: false })}] 「${t.text}」 → ${fmt(r.body.apply) || '(なし)'}${r.body.pending.length ? ` / 保留 ${fmt(r.body.pending)}` : ''}${r.body.rejected.length ? ` / 形式不正 ${fmt(r.body.rejected)}` : ''}${r.body.unplaced.length ? ` / 未配置 ${r.body.unplaced.join('・')}` : ''}`)
    } else {
      console.log(`[${new Date().toLocaleTimeString('ja-JP', { hour12: false })}] ${r.status} ${r.body.message}`)
    }
    return
  }
  const path = req.url === '/' ? '/index.html' : (req.url ?? '/')
  try {
    const data = await readFile(join(webDir, path))
    res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' }).end(data)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(port, () => console.log(`http://localhost:${port}  (Jev key: ${key ? 'set' : 'MISSING — .env を確認'}, trace → ${logFile})`))
