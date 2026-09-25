// 言語・ドメインの語彙と閾値。コアは全部ここ経由で読む。JSON で書けるのでホスト（拡張のオプション / サーバの設定ファイル / widget の属性）から注入できる。
// DEFAULT は日本語フォーム一般に必要な最小限。業務ドメインの語彙（同義語・単位・数値欄のラベル…）は presets か設定で足す。
export type SpeakfillConfig = {
  synonyms: { spoken: string; label: string }[]     // 発話語 → 欄ラベルに含まれる語（「名前」→ 氏名）
  numericLabels: string[]                           // type が無くても number 扱いにする欄ラベル語（部分一致）
  unitByLabel: { labels: string[]; unit: string }[] // 欄ラベル語 → 単位（Jev の criteria に添える）
  units: string[]                                   // 数値の直後に付く単位語（「幅50高さ60」の対分割で数値に含める）
  excludeLabels: string[]                           // 収集しない欄（ラベル部分一致。例: ふりがな）
  continuationLabels: string[]                      // 数字だけの発話を直前の値に連結する欄（電話・郵便）
  colors: Record<string, string>                    // color 型の色名 → #rrggbb
  timeZone: string                                  // 相対日付（今日/明日）を解決するタイムゾーン
  relativeDays: Record<string, number>              // 「今日」「きょう」→ 0、「明日」→ +1 …（読み違い・かな表記も登録する）
  relativeYears: Record<string, number>             // 「来年」「らいねん」→ +1 …
  noonWords: string[]                               // 「正午」
  telLabels: string[]                               // type が無くても tel 扱いにする欄ラベル語
  zipLabels: string[]                               // 同じく郵便番号（7 桁）
  particles: string[]                               // 単語分割で落とす助詞・語尾
  trailers: string[]                                // chunk 末尾から落とす丁寧語
  negations: string[]                               // 含んでいたら chunk を割らない（否定・除外）
  threshold: number                                 // 1 往復目（欄選択）の confidence 下限
  continueMs: number                                // 数字連結を許す時間
  maxFields: number                                 // 収集する欄の上限
  typeHints: Record<string, string>                 // type ごとの値の例（Jev の criteria に添える）
  sttNote: string                                   // 同音異義についての注意（instructions）
  instructions: string                              // ドメインの追加説明（自由記述。instructions 末尾に付く）
}

export const DEFAULT_CONFIG: SpeakfillConfig = {
  synonyms: [],
  numericLabels: [],
  unitByLabel: [],
  units: [],
  excludeLabels: [],
  continuationLabels: ['電話', 'TEL', 'tel', '携帯', 'FAX', '郵便', '〒', '番号'],
  timeZone: 'Asia/Tokyo',
  relativeDays: { 今日: 0, きょう: 0, 本日: 0, 明日: 1, あした: 1, あす: 1, 翌日: 1, 昨日: -1, きのう: -1, 明後日: 2, あさって: 2, 一昨日: -2, おととい: -2 },
  relativeYears: { 今年: 0, ことし: 0, 本年: 0, 来年: 1, らいねん: 1, 去年: -1, きょねん: -1, 昨年: -1, 再来年: 2, さらいねん: 2, 一昨年: -2, おととし: -2 },
  noonWords: ['正午', 'しょうご'],
  telLabels: ['電話', 'TEL', 'tel', '携帯', 'FAX'],
  zipLabels: ['郵便', '〒'],
  colors: { 赤: '#ff0000', 青: '#0000ff', 黒: '#000000', 白: '#ffffff', 緑: '#008000', 黄: '#ffff00', 黄色: '#ffff00', 灰: '#808080', 灰色: '#808080', グレー: '#808080', 茶: '#a52a2a', 茶色: '#a52a2a', 紫: '#800080', ピンク: '#ffc0cb', オレンジ: '#ffa500', 紺: '#000080' },
  particles: ['の', 'は', 'が', 'を', 'に', 'で', 'と', 'も', 'へ', 'や', 'から', 'まで', 'です', 'ます', 'だ', 'ね', 'よ', 'ください'],
  trailers: ['です', 'でございます', 'になります'],
  negations: ['ない', 'なく', '以外', 'じゃな', 'ではな'],
  threshold: 0.5,
  continueMs: 5000,
  maxFields: 100,
  typeHints: {
    date: ' — 「9月25日」「今日」「来年の8月6日」のような日付',
    time: ' — 「15時半」「午後3時」のような時刻',
    'datetime-local': ' — 日付と時刻',
    month: ' — 「2026年9月」「来年の8月」のような年月',
    number: ' — 数値',
    range: ' — 数値',
  },
  sttNote: '入力は音声認識の文字起こしで、同音異義の誤変換がありうる。読みが一致するものを優先せよ。',
  instructions: '',
}

// 部分指定を DEFAULT に重ねる。配列・辞書は置き換え（足したいときは DEFAULT を展開して渡す）
export function resolveConfig(partial?: Partial<SpeakfillConfig> | null): SpeakfillConfig {
  return { ...DEFAULT_CONFIG, ...(partial ?? {}) }
}

// 実行時の補助（正規表現は設定側に持たせず、ここで組む）
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const anyOf = (words: string[]): RegExp | null => (words.length ? new RegExp(words.map(esc).join('|')) : null)
export const matchesAny = (words: string[], text: string) => words.some((w) => w && text.includes(w))
