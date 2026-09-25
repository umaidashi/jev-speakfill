import { coerce } from '../../src/core/format'
import { resolveConfig } from '../../src/core/config'
import { JA_COMMERCE } from '../../src/core/presets'
const CFG = resolveConfig(JA_COMMERCE)
import type { Field } from '../../src/core/types'

const NOW = Date.UTC(2026, 8, 25, 3, 0)   // 2026-09-25 12:00 JST
const f = (type: string, extra: Partial<Field> = {}): Field => ({ id: 'x', label: 'x', kind: 'text', type, ...extra })
const ok = (text: string, field: Field, value: string) => expect(coerce(text, field, NOW)).toEqual({ value, status: 'ok' })
const bad = (text: string, field: Field) => expect(coerce(text, field, NOW).status).toBe('invalid')

test('date: 年月日 / 月日（今年）/ スラッシュ / 今日・明日・昨日', () => {
  ok('2026年9月25日', f('date'), '2026-09-25')
  ok('9月25日', f('date'), '2026-09-25')
  ok('2026/9/25', f('date'), '2026-09-25')
  ok('9/25', f('date'), '2026-09-25')
  ok('２０２６年１０月３日', f('date'), '2026-10-03')
  ok('今日', f('date'), '2026-09-25')
  ok('明日', f('date'), '2026-09-26')
  ok('昨日', f('date'), '2026-09-24')
})
test('date: 来年/今年/去年 + の', () => {
  ok('来年の8月6日', f('date'), '2027-08-06')
  ok('今年の4月4日', f('date'), '2026-04-04')
  ok('去年の12月31日', f('date'), '2025-12-31')
  ok('再来年の1月1日', f('date'), '2028-01-01')
  ok('来年8月6日', f('date'), '2027-08-06')
  ok('来年の8月', f('month'), '2027-08')
})
test('date: 実在しない日付・範囲外は invalid', () => {
  bad('2月30日', f('date'))
  bad('赤', f('date'))
  bad('2020年1月1日', f('date', { constraints: { min: '2026-01-01' } }))
  ok('2026年1月1日', f('date', { constraints: { min: '2026-01-01' } }), '2026-01-01')
})
test('time: 時分 / 半 / 午前午後 / コロン', () => {
  ok('15時30分', f('time'), '15:30')
  ok('3時半', f('time'), '03:30')
  ok('午後3時', f('time'), '15:00')
  ok('午後3時半', f('time'), '15:30')
  ok('午前9時', f('time'), '09:00')
  ok('15:30', f('time'), '15:30')
  ok('正午', f('time'), '12:00')
  bad('25時', f('time'))
  bad('明日', f('time'))
})
test('datetime-local / month', () => {
  ok('9月25日15時30分', f('datetime-local'), '2026-09-25T15:30')
  ok('明日午後3時', f('datetime-local'), '2026-09-26T15:00')
  bad('9月25日', f('datetime-local'))
  ok('2026年9月', f('month'), '2026-09')
  ok('9月', f('month'), '2026-09')
  ok('9月25日', f('month'), '2026-09')            // 日まで言われたら年月だけ使う
  ok('来年の12月25日', f('month'), '2027-12')
  ok('来年の12月25', f('month'), '2027-12')
  bad('13月', f('month'))
  ok('2025年 7月', f('month'), '2025-07')          // route の連結で空白が入っても読む
  ok('去年 7月', f('month'), '2025-07')
  ok('2026年 9月 25日', f('date'), '2026-09-25')
  ok('午後 3時 半', f('time'), '15:30')
})
test('number / range: 桁区切り・全角・単位を落とす。min/max/step', () => {
  ok('3000', f('number'), '3000')
  ok('3,000円', f('number'), '3000')
  ok('３０００', f('number'), '3000')
  ok('12.5', f('number'), '12.5')
  ok('マイナス5', f('number'), '-5')
  bad('赤', f('number'))
  bad('-1', f('number', { constraints: { min: '0' } }))
  bad('150', f('range', { constraints: { min: '0', max: '100' } }))
  bad('3050', f('number', { constraints: { step: '100' } }))
  ok('3100', f('number', { constraints: { step: '100' } }), '3100')
})
test('email / url: 形式のみ', () => {
  ok('a@b.jp', f('email'), 'a@b.jp')
  bad('アットテスト', f('email'))
  ok('https://example.com/x', f('url'), 'https://example.com/x')
  bad('example', f('url'))
})
test('color: 色名 → #rrggbb', () => {
  ok('赤', f('color'), '#ff0000')
  ok('白', f('color'), '#ffffff')
  ok('#00ff00', f('color'), '#00ff00')
  bad('革', f('color'))
})
test('tel / 郵便番号: 従来の桁数ルール（short を返す）', () => {
  ok('090 1234 5678', f('tel'), '090-1234-5678')
  expect(coerce('080', f('tel'), NOW).status).toBe('short')
  bad('0801234567890', f('tel'))
  ok('1000001', f('text', { label: '郵便番号' }), '100-0001')
})
test('text: pattern / maxLength', () => {
  ok('ABC123', f('text', { constraints: { pattern: '[A-Z]+\\d+' } }), 'ABC123')
  bad('abc', f('text', { constraints: { pattern: '[A-Z]+\\d+' } }))
  bad('長すぎる文字列', f('text', { constraints: { maxLength: 3 } }))
  ok('田中', f('text'), '田中')
})
test('week は対象外（invalid）', () => { bad('第39週', f('week')) })

test('number: 単位付き（円/グラム/個）は数値だけにする', () => {
  ok('100円', f('number'), '100')
  ok('500グラム', f('number'), '500')
  ok('3個', f('number'), '3')
})
test('type が無くても設定の numericLabels（価格/金額/重量…）に合うラベルは number として扱う。DEFAULT では verbatim', () => {
  const c = (t: string, label: string) => coerce(t, f('', { type: undefined, label }), NOW, CFG)
  expect(c('100円', '価格')).toEqual({ value: '100', status: 'ok' })
  expect(c('1,200円', '金額（税込）')).toEqual({ value: '1200', status: 'ok' })
  expect(c('250グラム', '重量')).toEqual({ value: '250', status: 'ok' })
  expect(c('赤', '価格').status).toBe('invalid')
  expect(coerce('100円', f('', { type: undefined, label: '価格' }), NOW)).toEqual({ value: '100円', status: 'ok' })   // DEFAULT
})

test('number: 万・億・千を展開する', () => {
  ok('12万円', f('number'), '120000')
  ok('15万8000円', f('number'), '158000')
  ok('1.5万', f('number'), '15000')
  ok('3千円', f('number'), '3000')
  ok('1億2000万', f('number'), '120000000')
  ok('32センチ', f('number'), '32')
})
