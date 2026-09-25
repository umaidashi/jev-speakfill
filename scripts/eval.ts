// 実 API で fixture を流し、段階ごとの中間結果と一致率を出す。CI では走らせない。
// 実行: npm run eval（.env の TYPESAFE_API_KEY を使う）。結果は docs/eval/latest.md にも書く
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { segment } from '../src/core/segment.ts'
import { route } from '../src/core/route.ts'
import { applyContext, gate, type Context } from '../src/core/context.ts'
import { callJev } from '../src/ext/jevClient.ts'
import type { Answer, Field, JevAsk } from '../src/core/types.ts'
import { resolveConfig } from '../src/core/config.ts'
import { JA_COMMERCE } from '../src/core/presets.ts'
const CFG = resolveConfig(JA_COMMERCE)

const key = process.env.TYPESAFE_API_KEY ?? ''
const NOW = Date.UTC(2026, 8, 25, 3)   // 日付ケースを固定するため 2026-09-25 JST
const fx = JSON.parse(readFileSync('tests/fixtures/ja.json', 'utf8')) as {
  fields: Field[]; cases: { text: string; expect: Record<string, string> }[]
}
const label = (id: string) => fx.fields.find((f) => f.id === id)?.label ?? id
const lines: string[] = [`# eval 結果 (${new Date().toISOString().slice(0, 16)})`, '', '欄: ' + fx.fields.map((f) => `${f.label}${f.options ? `[${f.options.join('/')}]` : ''}`).join(' / '), '']
let hit = 0, total = 0
for (const c of fx.cases) {
  const hops: string[] = []
  const ask: JevAsk = async (s, q) => {
    const a = await callJev(key, s, q)
    hops.push(Object.entries(a).map(([id, v]: [string, Answer]) => `${id}→${id.includes('_') ? v.choice : label(v.choice)} (${v.confidence.toFixed(2)})`).join(', '))
    return a
  }
  const ctx: Context = { hint: undefined, last: undefined }
  const chunks0 = segment(c.text, true, fx.fields, CFG)
  const { chunks, direct } = applyContext(chunks0, fx.fields, ctx, NOW, CFG)
  const placements = [...direct, ...(chunks.length ? await route(fx.fields, chunks, {}, ask, [], CFG) : [])]
  const g = gate(placements, fx.fields, ctx, NOW, CFG)
  const got = Object.fromEntries(g.apply.map((p) => [p.fieldId, p.value]))
  const keys = new Set([...Object.keys(c.expect), ...Object.keys(got)])
  let ok = true
  for (const k of keys) { total++; if (c.expect[k] === got[k]) hit++; else ok = false }
  const fmt = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${label(k)}=${v}`).join(', ') || '(なし)'
  lines.push(`## ${ok ? '✅' : '❌'} 「${c.text}」`, '',
    `- ① segment → ${JSON.stringify(chunks0)}`,
    `- ② context → chunks ${JSON.stringify(chunks)}${direct.length ? ` / 直接配置 ${JSON.stringify(direct)}` : ''}`,
    ...hops.map((h, i) => `- ③ Jev ${i + 1} 往復目 → ${h}`),
    `- ④ gate → apply ${fmt(got)}${g.pending.length ? ` / 保留 ${fmt(Object.fromEntries(g.pending.map((p) => [p.fieldId, p.value])))}` : ''}${g.rejected.length ? ` / 形式不正 ${fmt(Object.fromEntries(g.rejected.map((p) => [p.fieldId, p.value])))}` : ''}`,
    `- 期待 → ${fmt(c.expect)}`, '')
  console.log(`${ok ? '✅' : '❌'} ${c.text} → ${fmt(got)}`)
}
lines.push(`**一致 ${hit}/${total}**`)
mkdirSync('docs/eval', { recursive: true })
writeFileSync('docs/eval/latest.md', lines.join('\n') + '\n')
console.log(`一致 ${hit}/${total} → docs/eval/latest.md`)
