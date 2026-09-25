// 実 API で fixture を流し、欄ごとの一致率を出す。CI では走らせない。
// 実行: npm run eval（esbuild でバンドル → node。.env の TYPESAFE_API_KEY を使う）
import { readFileSync } from 'node:fs'
import { segment } from '../src/core/segment.ts'
import { route } from '../src/core/route.ts'
import { callJev } from '../src/ext/jevClient.ts'
import type { Field } from '../src/core/types.ts'

const key = process.env.TYPESAFE_API_KEY ?? ''
const fx = JSON.parse(readFileSync('tests/fixtures/ja.json', 'utf8')) as {
  fields: Field[]; cases: { text: string; expect: Record<string, string> }[]
}
let hit = 0, total = 0
for (const c of fx.cases) {
  const chunks = segment(c.text, true, fx.fields)
  const got = Object.fromEntries((await route(fx.fields, chunks, {}, (s, q) => callJev(key, s, q))).map((p) => [p.fieldId, p.value]))
  const keys = new Set([...Object.keys(c.expect), ...Object.keys(got)])
  for (const k of keys) { total++; if (c.expect[k] === got[k]) hit++ }
  console.log(JSON.stringify({ text: c.text, expect: c.expect, got }))
}
console.log(`一致 ${hit}/${total}`)
