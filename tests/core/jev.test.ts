import { buildQuestions, THRESHOLD } from '../../src/core/jev'
import type { Field } from '../../src/core/types'

const fields: Field[] = [
  { id: 'name', label: '氏名', kind: 'text' },
  { id: 'pref', label: '都道府県', kind: 'select', options: ['東京都', '大阪府'] },
]

test('chunk ごとに Choice を1問、criteria は欄ID + none', () => {
  const { questions } = buildQuestions(fields, [{ text: '山田太郎' }, { text: '東京', hint: '都道府県' }], {})
  expect(Object.keys(questions.c0.criteria)).toEqual(['name', 'pref', 'none'])
  expect(questions.c1.instructions).toContain('都道府県')      // hint が instructions に入る
})

test('select 欄がある chunk には option 選択を投機的に同梱', () => {
  const { questions } = buildQuestions(fields, [{ text: '東京' }], {})
  expect(Object.keys(questions.c0_pref.criteria)).toEqual(['東京都', '大阪府', 'none'])
})

test('欄選択・option 選択とも同音異義の注意が instructions に入る（Review Focus 6）', () => {
  const { questions } = buildQuestions(fields, [{ text: '川' }], {})
  expect(questions.c0.instructions).toContain('同音')
  expect(questions.c0_pref.instructions).toContain('同音')
})

test('state に欄と chunk と filled が入り、ページ本文は含まない', () => {
  const { state } = buildQuestions(fields, [{ text: '山田太郎' }], { name: '前の値' }) as { state: Record<string, unknown> }
  expect(Object.keys(state).sort()).toEqual(['chunks', 'fields', 'filled'])
})

test('閾値', () => expect(THRESHOLD).toBe(0.35))
