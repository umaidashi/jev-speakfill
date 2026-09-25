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

test('欄名の前方一致（「発売」→ 発売月）でもヒントになる。1 文字は対象外', () => {
  const ctx = fresh()
  const f2: Field[] = [...fields, { id: 'release', label: '発売月', kind: 'text', type: 'month' }]
  applyContext([{ text: '発売' }], f2, ctx, 0)
  expect(ctx.hint).toBe('発売月')
  const ctx2 = fresh()
  expect(applyContext([{ text: '発' }], f2, ctx2, 0).chunks).toEqual([{ text: '発' }])   // 1 文字の前方一致は値扱い
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

import { checkFormat, gate } from '../../src/core/context'

test('checkFormat: 電話は 10〜11 桁、郵便は 7 桁。短い/長い/対象外を区別する', () => {
  expect(checkFormat('080-0001-0023', '電話番号')).toBe('ok')
  expect(checkFormat('03-1234-5678', '電話番号')).toBe('ok')
  expect(checkFormat('080', '電話番号')).toBe('short')
  expect(checkFormat('08-0111-1111112222', '電話番号')).toBe('invalid')
  expect(checkFormat('100-0001', '郵便番号')).toBe('ok')
  expect(checkFormat('100', '郵便番号')).toBe('short')
  expect(checkFormat('10000012', '郵便番号')).toBe('invalid')
  expect(checkFormat('田中', '氏名')).toBe('na')
})

test('gate: ok は apply、short は pending（書かずに続きを待つ）、invalid は rejected', () => {
  const ctx = fresh()
  const p = (fieldId: string, value: string, chunk = value) => ({ fieldId, value, chunk, confidence: 0.9 })
  const g = gate([p('tel', '080'), p('zip', '10000012'), p('name', '田中')], fields, ctx, 100)
  expect(g.apply).toEqual([p('name', '田中')])
  expect(g.pending).toEqual([p('tel', '080')])
  expect(g.rejected).toEqual([p('zip', '10000012')])
  expect(ctx.last).toEqual({ fieldId: 'name', chunk: '田中', at: 100 })   // 最後に処理した配置
})

test('pending の数字欄は ctx.last に残り、続きが来たら連結して ok になる', () => {
  const ctx = fresh()
  gate([{ fieldId: 'tel', value: '080', chunk: '080', confidence: 0.9 }], fields, ctx, 0)
  expect(ctx.last).toEqual({ fieldId: 'tel', chunk: '080', at: 0 })
  const r = applyContext([{ text: '-0001 0023' }], fields, ctx, 1500)
  const g = gate(r.direct, fields, ctx, 1500)
  expect(g.apply).toEqual([{ fieldId: 'tel', value: '080-0001-0023', chunk: '080 -0001 0023', confidence: 1 }])
})

test('数字 chunk の先頭ハイフンは落として Jev に渡す', () => {
  const ctx = fresh()
  const r = applyContext([{ text: '-1800003' }], fields, ctx, 0)
  expect(r.chunks).toEqual([{ text: '1800003' }])
})

test('gate: type 付きの欄は coerce で正規形に変換して apply する（date/number）', () => {
  const ctx = fresh()
  const typed: Field[] = [
    { id: 'buy', label: '購入日', kind: 'text', type: 'date' },
    { id: 'price', label: '価格', kind: 'text', type: 'number', constraints: { min: '0' } },
  ]
  const g = gate([
    { fieldId: 'buy', value: '9月25日', chunk: '9月25日', confidence: 0.9 },
    { fieldId: 'price', value: '3,000円', chunk: '3,000円', confidence: 0.9 },
    { fieldId: 'price', value: 'マイナス5', chunk: 'マイナス5', confidence: 0.9 },
  ], typed, ctx, Date.UTC(2026, 8, 25, 3))
  expect(g.apply.map((p) => p.value)).toEqual(['2026-09-25', '3000'])
  expect(g.rejected.map((p) => p.value)).toEqual(['-5'])
})

test('checkbox のラベルと同じ chunk は値（チェック）であってヒントではない', () => {
  const ctx = fresh()
  const f2: Field[] = [...fields, { id: 'box', label: '箱', kind: 'checkbox', options: ['箱'] }]
  const r = applyContext([{ text: '箱' }], f2, ctx, 0)
  expect(r.chunks).toEqual([{ text: '箱' }])
  expect(ctx.hint).toBeUndefined()
})

test('gate: 数値欄に数字を含まない値（「たかさ」= 欄名の読み）が来たら、形式不正ではなく次の値のヒントにする', () => {
  const ctx = fresh()
  const typed: Field[] = [{ id: 'h', label: '高さ (cm)', kind: 'text', type: 'number' }]
  const g = gate([{ fieldId: 'h', value: 'たかさ', chunk: 'たかさ', confidence: 0.9 }], typed, ctx, 0)
  expect(g.apply).toEqual([]); expect(g.rejected).toEqual([])
  expect(ctx.hint).toBe('高さ (cm)')
})
