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
    return out
  }
}

test('text 欄は chunk を verbatim で配置', async () => {
  const r = await route(fields, [{ text: '山田太郎' }], {}, fakeAsk({ c0: answer('name') }))
  expect(r).toEqual([{ fieldId: 'name', value: '山田太郎', chunk: '山田太郎', confidence: 0.9 }])
})

test('電話欄は正規化', async () => {
  const r = await route(fields, [{ text: '０９０１２３４５６７８' }], {}, fakeAsk({ c0: answer('tel') }))
  expect(r[0].value).toBe('090-1234-5678')
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
  const ask: JevAsk = async () => { called++; return {} }
  expect(await route(fields, [], {}, ask)).toEqual([])
  expect(called).toBe(0)
})
