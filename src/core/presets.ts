import type { SpeakfillConfig } from './config'

// 日本語の商品登録・顧客情報フォーム向けの語彙。サンプル（ブランドバッグ）と eval が使う。
// 自分のドメインに合わせてコピーして編集し、ホストから注入する
export const JA_COMMERCE: Partial<SpeakfillConfig> = {
  synonyms: [
    { spoken: '名前', label: '氏名' }, { spoken: 'なまえ', label: '氏名' },
    { spoken: '電話', label: '電話' }, { spoken: 'メール', label: 'メール' },
    { spoken: '住所', label: '住所' }, { spoken: '郵便', label: '郵便' },
    { spoken: 'ふりがな', label: 'かな' }, { spoken: 'フリガナ', label: 'カナ' },
  ],
  numericLabels: ['価格', '金額', '値段', '料金', '単価', '重量', '重さ', '数量', '個数', '在庫', 'サイズ', '寸法', '高さ', '幅', '奥行', '長さ', 'マチ'],
  unitByLabel: [
    { labels: ['価格', '金額', '値段', '料金', '単価'], unit: '円' },
    { labels: ['重量', '重さ'], unit: 'g/kg' },
    { labels: ['サイズ', '寸法', '高さ', '幅', '奥行', '長さ', 'マチ'], unit: 'cm/mm' },
    { labels: ['数量', '個数', '在庫'], unit: '個/点/枚' },
  ],
  units: ['センチ', 'ミリ', '円', '個', '枚', '点', 'グラム', 'キロ'],
  excludeLabels: ['ふりがな', 'フリガナ', 'かな', 'カナ'],
  sttNote: '入力は音声認識の文字起こしで、同音異義の誤変換がありうる（例: 「川」「皮」→「革」、「町」→「マチ」）。読みが一致するものを優先せよ。',
  instructions: '',
}
