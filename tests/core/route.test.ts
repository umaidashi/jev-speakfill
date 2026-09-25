import { route } from '../../src/core/route'
import type { Answer, Field, JevAsk } from '../../src/core/types'

const fields: Field[] = [
  { id: 'name', label: '氏名', kind: 'text' },
  { id: 'tel', label: '電話番号', kind: 'text' },
  { id: 'pref', label: '都道府県', kind: 'select', options: ['東京都', '大阪府'] },
  { id: 'nolabel', label: '', kind: 'text' },
]

const answer = (choice: string, confidence = 0.9): Answer => ({
  type: 'choice', choice, probabilities: { [choice]: confidence }, confidence,
})

function fakeAsk(map: Record<string, Answer>): JevAsk {
  return async (_state, questions) => {
    const out: Record<string, Answer> = {}
    for (const id of Object.keys(questions)) out[id] = map[id] ?? answer('none', 0.1)
    return { answers: out, usage: { input_tokens: 10, output_tokens: 2 } }
  }
}

test('text 欄は chunk を verbatim で配置', async () => {
  const r = await route(fields, [{ text: '山田太郎' }], {}, fakeAsk({ c0: answer('name') }))
  expect(r).toEqual([{ fieldId: 'name', value: '山田太郎', chunk: '山田太郎', confidence: 0.9 }])
})

test('text 欄の値は route では触らない（正規化は gate の coerce がやる）', async () => {
  const r = await route(fields, [{ text: '０９０１２３４５６７８' }], {}, fakeAsk({ c0: answer('tel') }))
  expect(r[0].value).toBe('０９０１２３４５６７８')
})

test('select 欄は option 質問の答えを値にする', async () => {
  const r = await route(fields, [{ text: '東京' }], {}, fakeAsk({ c0: answer('pref'), c0_pref: answer('東京都') }))
  expect(r[0].value).toBe('東京都')
})

test('同音異義: chunk「川」でも option 質問が「革」を返せばそれを書く（Review Focus 6）', async () => {
  const f: Field[] = [...fields, { id: 'material', label: '素材', kind: 'select', options: ['革', '布', '金属'] }]
  const r = await route(f, [{ text: '川' }], {}, fakeAsk({ c0: answer('material'), c0_material: answer('革', 0.7) }))
  expect(r[0]).toMatchObject({ fieldId: 'material', value: '革', chunk: '川' })
})

test('select 欄で option が none なら未配置', async () => {
  const r = await route(fields, [{ text: '北海道' }], {}, fakeAsk({ c0: answer('pref'), c0_pref: answer('none') }))
  expect(r).toEqual([])
})

test('none / 低 confidence は未配置', async () => {
  const r = await route(fields, [{ text: 'えーと' }, { text: '山田' }], {}, fakeAsk({ c0: answer('none'), c1: answer('name', 0.2) }))
  expect(r).toEqual([])
})

test('ラベル空の欄があってもクラッシュしない（Review Focus 2）', async () => {
  const r = await route(fields, [{ text: 'x y' }], {}, fakeAsk({ c0: answer('nolabel') }))
  expect(r[0].fieldId).toBe('nolabel')
})

test('chunk が空なら ask を呼ばない', async () => {
  let called = 0
  const ask: JevAsk = async () => { called++; return { answers: {} } }
  expect(await route(fields, [], {}, ask)).toEqual([])
  expect(called).toBe(0)
})

test('同一発話で隣接 chunk が同じ text 欄に向いたら連結する（「山田 太郎」は空白、glue は空白なし）', async () => {
  const r = await route(fields, [{ text: '山田' }, { text: '太郎' }], {}, fakeAsk({ c0: answer('name'), c1: answer('name') }))
  expect(r).toEqual([{ fieldId: 'name', value: '山田 太郎', chunk: '山田 太郎', confidence: 0.9 }])
  const g = await route(fields, [{ text: '山田' }, { text: '太郎', glue: true }], {}, fakeAsk({ c0: answer('name'), c1: answer('name') }))
  expect(g).toEqual([{ fieldId: 'name', value: '山田太郎', chunk: '山田太郎', confidence: 0.9 }])
})

test('2 往復: 1 回目は欄選択だけ、2 回目は選ばれた選択肢欄の option 質問だけ', async () => {
  const calls: string[][] = []
  const ask: JevAsk = async (_s, questions) => {
    calls.push(Object.keys(questions))
    const out: Record<string, Answer> = {}
    for (const id of Object.keys(questions)) out[id] = id === 'c0' ? answer('name') : id === 'c1' ? answer('pref') : id === 'c1_pref' ? answer('大阪府') : answer('none')
    return { answers: out }
  }
  const r = await route(fields, [{ text: '山田' }, { text: '大阪' }], {}, ask)
  expect(calls).toEqual([['c0', 'c1'], ['c1_pref']])
  expect(r.map((p) => p.value)).toEqual(['山田', '大阪府'])
})

test('選択肢欄が選ばれなければ 2 回目は呼ばない', async () => {
  let n = 0
  const r = await route(fields, [{ text: '山田' }], {}, async (_s, q) => { n++; const o: Record<string, Answer> = {}; for (const id of Object.keys(q)) o[id] = answer('name'); return { answers: o } })
  expect(n).toBe(1)
  expect(r[0].value).toBe('山田')
})

test('隣接 chunk が同じ選択肢欄に向いたら confidence の高い方だけ残す（ほぼ|新品 → 未使用に近い）', async () => {
  const f: Field[] = [{ id: 'cond', label: '状態', kind: 'select', options: ['新品', '未使用に近い'] }]
  const r = await route(f, [{ text: 'ほぼ' }, { text: '新品', glue: true }], {}, fakeAsk({
    c0: answer('cond', 0.93), c1: answer('cond', 0.97), c0_cond: answer('未使用に近い', 0.61), c1_cond: answer('新品', 0.5),
  }))
  expect(r).toEqual([{ fieldId: 'cond', value: '未使用に近い', chunk: 'ほぼ', confidence: 0.93 }])
})

test('数値・日付欄には隣接 chunk を連結しない（町 + 100 を「町 100」にしない）', async () => {
  const f: Field[] = [{ id: 'd', label: 'マチ (cm)', kind: 'text', type: 'number' }]
  const r = await route(f, [{ text: '町' }, { text: '100' }], {}, fakeAsk({ c0: answer('d', 0.7), c1: answer('d', 0.8) }))
  expect(r.map((p) => p.value)).toEqual(['町', '100'])
})

test('1 つの発話断片の全単語が同じ自由記述欄に向いたら、元の文をそのまま値にする（底面に傷あり）', async () => {
  const f: Field[] = [{ id: 'note', label: '備考', kind: 'text' }]
  const src = '底面に傷あり'
  const r = await route(f, [{ text: '底面', src, srcN: 2 }, { text: '傷あり', glue: true, src, srcN: 2 }], {}, fakeAsk({ c0: answer('note'), c1: answer('note') }))
  expect(r).toEqual([{ fieldId: 'note', value: '底面に傷あり', chunk: '底面に傷あり', confidence: 0.9 }])
})

test('optionThreshold 未満の選択肢は採らない', async () => {
  const { resolveConfig } = await import('../../src/core/config')
  const cfg = resolveConfig({ optionThreshold: 0.8 })
  const r = await route(fields, [{ text: '東京' }], {}, fakeAsk({ c0: answer('pref'), c0_pref: answer('東京都', 0.5) }), [], cfg)
  expect(r).toEqual([])
})
