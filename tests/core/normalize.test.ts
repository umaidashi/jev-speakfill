import { normalize } from '../../src/core/normalize'

test('電話欄: 全角・空白・ハイフン混在を半角数字ハイフンに', () => {
  expect(normalize('０９０ 1234 5678', '電話番号')).toBe('090-1234-5678')
})
test('郵便番号欄: 7桁を 3-4 に', () => {
  expect(normalize('1000001', '郵便番号')).toBe('100-0001')
})
test('それ以外の欄は verbatim', () => {
  expect(normalize('山田 太郎', '氏名')).toBe('山田 太郎')
})
test('電話欄でも数字が見つからなければ verbatim', () => {
  expect(normalize('あとで', '電話番号')).toBe('あとで')
})
