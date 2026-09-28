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

test('hint がある chunk は、Jev が none / 低 confidence でも hint の欄に入れる（話者が欄名を言ったなら信じる）', async () => {
  const f: Field[] = [...fields, { id: 'note', label: '備考', kind: 'text' }]
  const r = await route(f, [{ text: '吾輩は猫である', hint: '備考' }], {}, fakeAsk({ c0: { type: 'choice', choice: 'none', probabilities: { none: 0.6, note: 0.3 }, confidence: 0.6 } }))
  expect(r).toEqual([{ fieldId: 'note', value: '吾輩は猫である', chunk: '吾輩は猫である', confidence: 0.3 }])
})

describe('欄名の判定を Jev に任せる（同義語の登録なしで LINE→ライン、尾行→備考）', () => {
  const f: Field[] = [
    { id: 'model', label: 'ライン・モデル名', kind: 'text' },
    { id: 'note', label: '備考', kind: 'text' },
    { id: 'color', label: '色', kind: 'select', options: ['黒', '赤'] },
  ]
  test('criteria に「欄名として言っている」選択肢（label:<id>）が入る（短い非数値 chunk のみ）', async () => {
    let seen: string[] = []
    await route(f, [{ text: 'LINE' }, { text: '123456789012' }], {}, async (_s, q) => { seen = Object.keys((q as any).c0.criteria); expect(Object.keys((q as any).c1.criteria)).not.toContain('label:model'); return { answers: { c0: answer('none', 0.9), c1: answer('none', 0.9) } } })
    expect(seen).toContain('label:model')
    expect(seen).toContain('none')
  })
  test('label:<id> と判定された chunk は値にせず、続く chunk をその欄に入れる（断片全体を値にする）', async () => {
    const src = 'はアナグラム'
    const meta = { pendingHint: undefined as string | undefined, labelAt: [] as number[] }
    const r = await route(f, [{ text: 'LINE' }, { text: 'アナグラム', src: 'はアナグラム', srcN: 1 }], {}, fakeAsk({ c0: answer('label:model', 0.8), c1: answer('none', 0.7) }), [], undefined, meta)
    expect(r).toEqual([{ fieldId: 'model', value: 'アナグラム', chunk: 'アナグラム', confidence: 0.8 }])
    expect(meta.labelAt).toEqual([0])
    void src
  })
  test('label:<id> が最後の chunk なら pendingHint として返す（次の発話のヒント）', async () => {
    const meta = { pendingHint: undefined as string | undefined, labelAt: [] as number[] }
    const r = await route(f, [{ text: '尾行' }], {}, fakeAsk({ c0: answer('label:note', 0.8) }), [], undefined, meta)
    expect(r).toEqual([])
    expect(meta.pendingHint).toBe('備考')
  })
  test('自由記述欄の欄名の後は、同じ断片（src）の残りをまとめて 1 つの値にする', async () => {
    const src = '吾輩は猫である名前はまだない'
    const meta = { pendingHint: undefined as string | undefined, labelAt: [] as number[] }
    const chunks = [{ text: '尾行' }, { text: '吾輩', src, srcN: 3 }, { text: '猫', glue: true, src, srcN: 3 }, { text: 'まだない', glue: true, src, srcN: 3, hint: '氏名' }]
    const r = await route(f, chunks, {}, fakeAsk({ c0: answer('label:note', 0.8), c1: answer('none', 0.5), c2: answer('none', 0.5), c3: answer('none', 0.5) }), [], undefined, meta)
    expect(r).toEqual([{ fieldId: 'note', value: src, chunk: src, confidence: 0.8 }])
  })
})

test('断片に欄名が含まれていた（hint）とき、原文をまとめて値にする際は欄名と助詞を除く（備考欄は底面に傷あり → 底面に傷あり）', async () => {
  const f: Field[] = [{ id: 'note', label: '備考', kind: 'text' }]
  const src = '備考欄は底面に傷あり'
  const r = await route(f, [{ text: '底面', hint: '備考', src, srcN: 2 }, { text: '傷あり', hint: '備考', glue: true, src, srcN: 2 }], {}, fakeAsk({ c0: answer('note'), c1: answer('note') }))
  expect(r).toEqual([{ fieldId: 'note', value: '底面に傷あり', chunk: '底面に傷あり', confidence: 0.9 }])
})
