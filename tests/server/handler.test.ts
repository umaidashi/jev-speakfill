import { handleRoute } from '../../src/server/handler'
import type { Answer } from '../../src/core/types'

const answer = (choice: string, confidence = 0.9): Answer => ({ type: 'choice', choice, probabilities: { [choice]: confidence }, confidence })
const ask = async (_s: unknown, q: Record<string, unknown>) => Object.fromEntries(Object.keys(q).map((id) => [id, id === 'c0' ? answer('name') : answer('none')]))
const fields = [{ id: 'name', label: '氏名', kind: 'text' as const }]

test('JSON の RouteInput を受けて RouteResult を返す', async () => {
  const r = await handleRoute(JSON.stringify({ fields, text: '田中', filled: {}, ctx: { hint: null, last: null }, now: 0 }), ask)
  expect(r.status).toBe(200)
  expect(r.body.apply).toEqual([{ fieldId: 'name', value: '田中', chunk: '田中', confidence: 0.9 }])
})

test('不正な body は 400', async () => {
  expect((await handleRoute('{', ask)).status).toBe(400)
  expect((await handleRoute(JSON.stringify({ text: 'x' }), ask)).status).toBe(400)
})

test('Jev 失敗は 502 と message', async () => {
  const r = await handleRoute(JSON.stringify({ fields, text: '田中', filled: {}, ctx: {}, now: 0 }), async () => { throw new Error('jev 429') })
  expect(r.status).toBe(502)
  expect(r.body.message).toBe('jev 429')
})
