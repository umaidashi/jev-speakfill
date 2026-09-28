import { pickTranscript } from '../../src/core/transcript'
import type { Field } from '../../src/core/types'

const fields: Field[] = [
  { id: 'note', label: '備考', kind: 'text' },
  { id: 'd', label: 'マチ (cm)', kind: 'text', type: 'number' },
  { id: 'color', label: '色', kind: 'select', options: ['黒', '赤'] },
]

test('音声認識の候補（alternatives）に欄名・選択肢がより多く含まれるものがあれば、それを採る', () => {
  expect(pickTranscript('尾行 底面に傷あり', ['備考 底面に傷あり', '非行 底面に傷あり'], fields)).toBe('備考 底面に傷あり')
  expect(pickTranscript('幅50 高さ60 町 20', ['幅50 高さ60 マチ 20'], fields)).toBe('幅50 高さ60 マチ 20')
})
test('候補が同点なら第一候補を採る（勝手に変えない）', () => {
  expect(pickTranscript('赤い革のバッグ', ['赤い皮のバッグ', '赤い川のバッグ'], fields)).toBe('赤い革のバッグ')
  expect(pickTranscript('唐揚げ食べる', ['空揚げ食べる'], fields)).toBe('唐揚げ食べる')
})
test('alternatives が無ければそのまま', () => {
  expect(pickTranscript('尾行', undefined, fields)).toBe('尾行')
  expect(pickTranscript('尾行', [], fields)).toBe('尾行')
})
