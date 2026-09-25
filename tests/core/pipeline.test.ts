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
  return out
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
  const r = await pipeline({ fields, text: '電話番号', filled: {}, ctx: fresh(), now: 0 }, async () => { called++; return {} })
  expect(called).toBe(0)
  expect(r.hint).toBe('電話番号')
  expect(r.ctx.hint).toBe('電話番号')
})

test('未配置の chunk を unplaced に返す', async () => {
  const r = await pipeline({ fields, text: 'えーと', filled: {}, ctx: fresh(), now: 0 }, async (_s, q) => Object.fromEntries(Object.keys(q).map((id) => [id, answer('none')])))
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
})
