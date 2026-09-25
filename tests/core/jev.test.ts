import { buildQuestions, optionQuestion, THRESHOLD } from '../../src/core/jev'
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

test('1 往復目は欄選択だけ（option 質問は同梱しない）', () => {
  const { questions } = buildQuestions(fields, [{ text: '東京' }], {})
  expect(Object.keys(questions)).toEqual(['c0'])
})

test('optionQuestion は選択肢 + none を criteria にする', () => {
  expect(Object.keys(optionQuestion(0, fields[1]).criteria)).toEqual(['東京都', '大阪府', 'none'])
})

test('欄選択・option 選択とも同音異義の注意が instructions に入る（Review Focus 6）', () => {
  const { questions } = buildQuestions(fields, [{ text: '川' }], {})
  expect(questions.c0.instructions).toContain('同音')
  expect(optionQuestion(0, fields[1]).instructions).toContain('同音')
})

test('state に欄と chunk と filled が入り、ページ本文は含まない', () => {
  const { state } = buildQuestions(fields, [{ text: '山田太郎' }], { name: '前の値' }) as { state: Record<string, unknown> }
  expect(Object.keys(state).sort()).toEqual(['chunks', 'fields', 'filled'])
})

test('閾値', () => expect(THRESHOLD).toBe(0.35))

test('type 付きの欄は criteria に type を書く（Jev が日付欄と分かるように）', () => {
  const typed: Field[] = [{ id: 'buy', label: '購入日', kind: 'text', type: 'date' }]
  const { questions } = buildQuestions(typed, [{ text: '9月25日' }], {})
  expect(questions.c0.criteria.buy).toBe('購入日 (text: date — 「9月25日」「今日」「来年の8月6日」のような日付)')
})
