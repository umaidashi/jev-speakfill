import { segment } from '../../src/core/segment'
import type { Field } from '../../src/core/types'

const fields: Field[] = [
  { id: 'name', label: '氏名', kind: 'text' },
  { id: 'tel', label: '電話番号', kind: 'text' },
  { id: 'email', label: 'メールアドレス', kind: 'text' },
  { id: 'pref', label: '都道府県', kind: 'select', options: ['東京都', '大阪府'] },
]

test('interim は何も返さない', () => {
  expect(segment('山田太郎、電話は', false, fields)).toEqual([])
})

test('読点で割る（MVP 入力）', () => {
  expect(segment('赤、革、ルイヴィトン', true, fields)).toEqual([
    { text: '赤' }, { text: '革' }, { text: 'ルイヴィトン' },
  ])
})

test('空白のみでも割る（Review Focus 1）', () => {
  expect(segment('山田太郎 09012345678', true, fields)).toEqual([
    { text: '山田太郎' }, { text: '09012345678' },
  ])
})

test('欄ラベル語+は を剥がして hint にする', () => {
  expect(segment('電話は09012345678、メールはa@b.jp', true, fields)).toEqual([
    { text: '09012345678', hint: '電話番号' },
    { text: 'a@b.jp', hint: 'メールアドレス' },
  ])
})

test('同義語表でも hint が付く', () => {
  expect(segment('名前は山田太郎', true, fields)).toEqual([{ text: '山田太郎', hint: '氏名' }])
})

test('欄ラベル語の直前で 1 chunk 内の複数値を割る', () => {
  expect(segment('山田太郎で電話は09012345678です', true, fields)).toEqual([
    { text: '山田太郎' }, { text: '09012345678', hint: '電話番号' },
  ])
})

test('ラベル語を含まない文は助詞で割らない', () => {
  expect(segment('東京都は広いです', true, fields)).toEqual([{ text: '東京都は広い' }])
})

test('空は捨てるが 1 文字（赤・革）は残す', () => {
  expect(segment('、。 、', true, fields)).toEqual([])
  expect(segment('赤', true, fields)).toEqual([{ text: '赤' }])
})

test('空白区切りの数字は 1 つの chunk に結合する（電話番号の読み上げ）', () => {
  expect(segment('大阪 男性 090 9876 5432', true, fields)).toEqual([
    { text: '大阪' }, { text: '男性' }, { text: '090 9876 5432' },
  ])
})

test('終助詞と衝突する名前を削らない（あかね・みさと・ちよ）', () => {
  expect(segment('あかね、みさと、ちよ', true, fields)).toEqual([{ text: 'あかね' }, { text: 'みさと' }, { text: 'ちよ' }])
  expect(segment('名前はみさと', true, fields)).toEqual([{ text: 'みさと', hint: '氏名' }])
})

test('ラベル語付きでも空白区切りの数字を 1 chunk に結合する', () => {
  expect(segment('電話は090 1234 5678', true, fields)).toEqual([{ text: '090 1234 5678', hint: '電話番号' }])
})
