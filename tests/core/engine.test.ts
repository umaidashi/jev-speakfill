import { Engine, type Host, type EngineEvent } from '../../src/core/engine'
import type { Field, Placement } from '../../src/core/types'
import type { RouteInput, RouteResult } from '../../src/core/pipeline'

const fields: Field[] = [
  { id: 'name', label: '氏名', kind: 'text' },
  { id: 'tel', label: '電話番号', kind: 'text' },
]
const p = (fieldId: string, value: string, chunk = value): Placement => ({ fieldId, value, chunk, confidence: 0.9 })

// メモリ上のフォームを持つ fake ホスト。route は入力ごとに台本で返す
function fakeHost(script: Record<string, Partial<RouteResult>>) {
  const values: Record<string, string> = {}
  const inputs: RouteInput[] = []
  const host: Host = {
    fields: async () => fields,
    apply: async (pl) => { const prev = values[pl.fieldId] ?? ''; values[pl.fieldId] = pl.value; return { fieldId: pl.fieldId, prev } },
    restore: async (id, prev) => { values[id] = prev },
    route: async (input) => {
      inputs.push(input)
      const r = script[input.text] ?? {}
      return { apply: [], pending: [], rejected: [], unplaced: [], ctx: input.ctx, ...r } as RouteResult
    },
  }
  return { host, values, inputs }
}

test('final → route → apply され、placed イベントが出る', async () => {
  const { host, values } = fakeHost({ '田中': { apply: [p('name', '田中')] } })
  const events: EngineEvent[] = []
  const e = new Engine(host, (ev) => events.push(ev))
  await e.final('田中')
  expect(values).toEqual({ name: '田中' })
  expect(events).toEqual([{ type: 'placed', fieldId: 'name', label: '氏名', value: '田中', confidence: 0.9 }])
})

test('filled と ctx が次の route に持ち回られる', async () => {
  const { host, inputs } = fakeHost({
    '田中': { apply: [p('name', '田中')], ctx: { hint: undefined, last: { fieldId: 'name', chunk: '田中', at: 5 } } },
    '080': { pending: [p('tel', '080')] },
  })
  const e = new Engine(host, () => {}, () => 5)
  await e.final('田中')
  await e.final('080')
  expect(inputs[1].filled).toEqual({ name: '田中' })
  expect(inputs[1].ctx.last).toEqual({ fieldId: 'name', chunk: '田中', at: 5 })
  expect(inputs[1].now).toBe(5)
})

test('pending / rejected / unplaced / hint はイベントになり、書かない', async () => {
  const { host, values } = fakeHost({
    'x': { pending: [p('tel', '080')], rejected: [p('tel', '0801234567890')], unplaced: ['えーと'], hint: '電話番号' },
  })
  const events: EngineEvent[] = []
  await new Engine(host, (ev) => events.push(ev)).final('x')
  expect(values).toEqual({})
  expect(events.map((ev) => ev.type)).toEqual(['waiting', 'unplaced', 'pending', 'rejected'])
})

test('undo は直前の配置を戻し、filled から消す', async () => {
  const { host, values, inputs } = fakeHost({ '田中': { apply: [p('name', '田中')] }, '佐藤': { apply: [p('name', '佐藤')] }, 'z': {} })
  const events: EngineEvent[] = []
  const e = new Engine(host, (ev) => events.push(ev))
  await e.final('田中'); await e.final('佐藤')
  expect(e.canUndo).toBe(true)
  await e.undo()
  expect(values).toEqual({ name: '田中' })
  await e.final('z')
  expect(inputs[2].filled).toEqual({ name: '田中' })
  await e.undo()
  expect(values).toEqual({ name: '' })
  expect(e.canUndo).toBe(false)
  expect(events.filter((ev) => ev.type === 'undone')).toHaveLength(2)
})

test('route が失敗したら error イベントで止まらない', async () => {
  const { host } = fakeHost({})
  host.route = async () => { throw new Error('jev 429') }
  const events: EngineEvent[] = []
  await new Engine(host, (ev) => events.push(ev)).final('田中')
  expect(events).toEqual([{ type: 'error', message: 'jev 429', text: '田中' }])
})

test('final が連続しても直列に処理する', async () => {
  const order: string[] = []
  const { host } = fakeHost({})
  host.route = async (i) => { await new Promise((r) => setTimeout(r, i.text === 'a' ? 20 : 0)); order.push(i.text); return { apply: [], pending: [], rejected: [], unplaced: [], ctx: i.ctx } as unknown as RouteResult }
  const e = new Engine(host, () => {})
  await Promise.all([e.final('a'), e.final('b')])
  expect(order).toEqual(['a', 'b'])
})

test('直前 3 発話を recent として route に渡す', async () => {
  const { host, inputs } = fakeHost({})
  const e = new Engine(host, () => {})
  for (const t of ['a', 'b', 'c', 'd']) await e.final(t)
  expect(inputs[3].recent).toEqual(['a', 'b', 'c'])
  expect(inputs[0].recent).toEqual([])
})
