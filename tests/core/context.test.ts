import { applyContext, type Context } from '../../src/core/context'
import type { Field } from '../../src/core/types'

const fields: Field[] = [
  { id: 'name', label: '氏名', kind: 'text' },
  { id: 'tel', label: '電話番号', kind: 'text' },
  { id: 'zip', label: '郵便番号', kind: 'text' },
  { id: 'color', label: '色', kind: 'select', options: ['赤', '青'] },
]
const fresh = (): Context => ({ hint: undefined, last: undefined })

test('欄名だけの chunk は値にせず、次の chunk のヒントになる', () => {
  const ctx = fresh()
  const r1 = applyContext([{ text: '郵便番号' }], fields, ctx, 0)
  expect(r1).toEqual({ chunks: [], direct: [] })
  expect(ctx.hint).toBe('郵便番号')
  const r2 = applyContext([{ text: '1000001' }], fields, ctx, 1000)
  expect(r2.chunks).toEqual([{ text: '1000001', hint: '郵便番号' }])
  expect(ctx.hint).toBeUndefined()
})

test('同義語（電話）でもヒントになる', () => {
  const ctx = fresh()
  applyContext([{ text: '電話' }], fields, ctx, 0)
  expect(ctx.hint).toBe('電話番号')
})

test('直前に数字欄へ置いた直後の数字 chunk は、その欄の値に連結する（Jev を呼ばない）', () => {
  const ctx = fresh()
  ctx.last = { fieldId: 'tel', chunk: '080', at: 0 }
  const r = applyContext([{ text: '-00010023' }], fields, ctx, 2000)
  expect(r.chunks).toEqual([])
  expect(r.direct).toEqual([{ fieldId: 'tel', value: '080-0001-0023', chunk: '080 -00010023', confidence: 1 }])
  expect(ctx.last).toEqual({ fieldId: 'tel', chunk: '080 -00010023', at: 2000 })
})

test('時間が空いていれば連結しない', () => {
  const ctx = fresh()
  ctx.last = { fieldId: 'tel', chunk: '080', at: 0 }
  const r = applyContext([{ text: '1234' }], fields, ctx, 10000)
  expect(r.chunks).toEqual([{ text: '1234' }])
  expect(r.direct).toEqual([])
})

test('直前が数字欄でなければ連結しない', () => {
  const ctx = fresh()
  ctx.last = { fieldId: 'name', chunk: '田中', at: 0 }
  const r = applyContext([{ text: '1234' }], fields, ctx, 500)
  expect(r.chunks).toEqual([{ text: '1234' }])
})

test('数字以外の chunk はそのまま通す', () => {
  const ctx = fresh()
  ctx.last = { fieldId: 'tel', chunk: '080', at: 0 }
  const r = applyContext([{ text: '青' }], fields, ctx, 500)
  expect(r.chunks).toEqual([{ text: '青' }])
})
