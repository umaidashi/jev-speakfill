import { pipeline } from '../../src/core/pipeline'
import type { Answer, Field, JevAsk } from '../../src/core/types'

const fields: Field[] = [
  { id: 'name', label: '氏名', kind: 'text' },
  { id: 'tel', label: '電話番号', kind: 'text' },
  { id: 'color', label: '色', kind: 'select', options: ['赤', '青'] },
]
const answer = (choice: string, confidence = 0.9): Answer => ({ type: 'choice', choice, probabilities: { [choice]: confidence }, confidence })
const ask: JevAsk = async (_s, q) => {
  const out: Record<string, Answer> = {}
  for (const id of Object.keys(q)) out[id] = id === 'c0' ? answer('color') : id === 'c1' ? answer('tel') : id === 'c0_color' ? answer('赤') : answer('none')
  return { answers: out, usage: { input_tokens: 100, output_tokens: 20 }, model: 'jev-latest' }
}
const fresh = () => ({ hint: undefined, last: undefined })

test('segment → context → route → gate を通して結果と次の ctx を返す', async () => {
  const r = await pipeline({ fields, text: '赤、080', filled: {}, ctx: fresh(), now: 0 }, ask)
  expect(r.apply).toEqual([{ fieldId: 'color', value: '赤', chunk: '赤', confidence: 0.9 }])
  expect(r.pending.map((p) => p.value)).toEqual(['080'])
  expect(r.ctx.last).toEqual({ fieldId: 'tel', chunk: '080', at: 0 })
})

test('欄名だけなら hint を返し、Jev を呼ばない', async () => {
  let called = 0
  const r = await pipeline({ fields, text: '電話番号', filled: {}, ctx: fresh(), now: 0 }, async () => { called++; return { answers: {} } })
  expect(called).toBe(0)
  expect(r.hint).toBe('電話番号')
  expect(r.ctx.hint).toBe('電話番号')
})

test('未配置の chunk を unplaced に返す', async () => {
  const r = await pipeline({ fields, text: 'えーと', filled: {}, ctx: fresh(), now: 0 }, async (_s, q) => ({ answers: Object.fromEntries(Object.keys(q).map((id) => [id, answer('none')])) }))
  expect(r.apply).toEqual([])
  expect(r.unplaced).toEqual(['えーと'])
})

test('trace に文字起こしから配置までの全段階が残る', async () => {
  const r = await pipeline({ fields, text: '赤、080', filled: { name: '田中' }, ctx: fresh(), now: 123 }, ask)
  const t = r.trace
  expect(t.text).toBe('赤、080')
  expect(t.at).toBe(123)
  expect(t.filled).toEqual({ name: '田中' })
  expect(t.segment).toEqual([{ text: '赤' }, { text: '080' }])
  expect(t.context.chunks).toEqual([{ text: '赤' }, { text: '080' }])
  expect(t.jev).toHaveLength(2)                                   // 欄選択 + 選択肢
  expect(Object.keys(t.jev[0].questions)).toEqual(['c0', 'c1'])
  expect(t.jev[0].answers.c0.choice).toBe('color')
  expect(t.jev[1].answers.c0_color.choice).toBe('赤')
  expect(t.gate.apply.map((p) => p.value)).toEqual(['赤'])
  expect(t.gate.pending.map((p) => p.value)).toEqual(['080'])
  expect(t.jev[0].usage).toEqual({ input_tokens: 100, output_tokens: 20 })   // 往復ごとの usage が残る
  expect(t.jev[0].model).toBe('jev-latest')
})

test('欄名だけの発話が Jev 経由で数値欄に落ちた場合も hint として返る', async () => {
  const typed: Field[] = [{ id: 'h', label: '高さ (cm)', kind: 'text', type: 'number' }]
  const ask2: JevAsk = async (_s, q) => ({ answers: Object.fromEntries(Object.keys(q).map((id) => [id, answer('h')])) })
  const r = await pipeline({ fields: typed, text: 'たかさ', filled: {}, ctx: fresh(), now: 0 }, ask2)
  expect(r.hint).toBe('高さ (cm)')
  expect(r.rejected).toEqual([])
})

test('欄名だけの chunk（町 = マチ）を Jev が欄に当てたら、直後の数字 chunk はその欄に直接入れる（Jev を追加で呼ばない）', async () => {
  const typed: Field[] = [
    { id: 'w', label: '幅 (cm)', kind: 'text', type: 'number' },
    { id: 'd', label: 'マチ (cm)', kind: 'text', type: 'number' },
  ]
  const ask2: JevAsk = async (_s, q) => ({ answers: Object.fromEntries(Object.keys(q).map((id) => [id, id === 'c0' ? answer('w') : id === 'c1' ? answer('d', 0.7) : answer('none', 0.2)])) })
  const r = await pipeline({ fields: typed, text: '幅は200 町 100', filled: {}, ctx: fresh(), now: 0 }, ask2)
  expect(r.apply).toEqual([
    { fieldId: 'w', value: '200', chunk: '200', confidence: 0.9 },
    { fieldId: 'd', value: '100', chunk: '100', confidence: 0.7 },
  ])
  expect(r.rejected).toEqual([])
  expect(r.unplaced).toEqual([])
  expect(r.ctx.hint).toBeUndefined()   // 使い切ったヒントは残さない
})

test('RouteInput.config で語彙を注入できる（同義語「名前」→ 氏名）', async () => {
  const ask2: JevAsk = async (_s, q) => ({ answers: Object.fromEntries(Object.keys(q).map((id) => [id, answer('name')])) })
  const r = await pipeline({ fields, text: '名前は田中', filled: {}, ctx: fresh(), now: 0, config: { synonyms: [{ spoken: '名前', label: '氏名' }] } }, ask2)
  expect(r.trace.segment).toEqual([{ text: '田中', hint: '氏名' }])
})

test('日付欄でパーサが読めない語（あくる日）は、コードが候補を列挙して Jev に選ばせる（生成はさせない）', async () => {
  const typed: Field[] = [{ id: 'buy', label: '仕入日', kind: 'text', type: 'date' }]
  const calls: Record<string, unknown>[] = []
  const ask2: JevAsk = async (_s, q) => {
    calls.push(q)
    const out: Record<string, Answer> = {}
    for (const id of Object.keys(q)) out[id] = id === 'c0' ? answer('buy') : answer('2026-09-26', 0.9)   // 候補「明日」を選ぶ
    return { answers: out }
  }
  const NOW = Date.UTC(2026, 8, 25, 3)
  const r = await pipeline({ fields: typed, text: 'あくる日', filled: {}, ctx: fresh(), now: NOW }, ask2)
  expect(r.apply).toEqual([{ fieldId: 'buy', value: '2026-09-26', chunk: 'あくる日', confidence: 0.9 }])
  expect(r.rejected).toEqual([])
  const dateQ = calls[1].date_buy as { criteria: Record<string, string> }
  expect(Object.keys(dateQ.criteria)).toContain('2026-09-26')   // 候補はコードが作った日付
  expect(Object.keys(dateQ.criteria)).toContain('none')
})

test('「らいねんの8月6日」のように骨格が読めれば、年の候補（今年/来年/去年…）だけを Jev に選ばせる', async () => {
  const typed: Field[] = [{ id: 'buy', label: '仕入日', kind: 'text', type: 'date' }]
  const ask2: JevAsk = async (_s, q) => {
    const out: Record<string, Answer> = {}
    for (const id of Object.keys(q)) out[id] = id === 'c0' ? answer('buy') : answer('2027-08-06', 0.8)
    return { answers: out }
  }
  const r = await pipeline({ fields: typed, text: '次の年の8月6日', filled: {}, ctx: fresh(), now: Date.UTC(2026, 8, 25, 3) }, ask2)
  expect(r.apply.map((p) => p.value)).toEqual(['2027-08-06'])
})

test('prompts.date で日付候補の質問文を差し替えられる', async () => {
  const typed: Field[] = [{ id: 'buy', label: '仕入日', kind: 'text', type: 'date' }]
  const calls: Record<string, { instructions: string }>[] = []
  const ask2: JevAsk = async (_s, q) => { calls.push(q as never); return { answers: Object.fromEntries(Object.keys(q).map((id) => [id, id === 'c0' ? answer('buy') : answer('none')])) } }
  await pipeline({ fields: typed, text: 'あくる日', filled: {}, ctx: fresh(), now: Date.UTC(2026, 8, 25, 3), config: { prompts: { field: 'F{i}', option: 'O{i}', date: 'D {chunk}/{label}/{today}' } } }, ask2)
  expect(calls[1].date_buy.instructions).toBe('D あくる日/仕入日/2026-09-25')
})
