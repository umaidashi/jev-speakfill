import type { Chunk, Field } from './types'

// ponytail: 日本語ヒューリスティック。境界が誤るケースが出たら spec の B 案（欄ごとの Noul）を none 時 fallback に足す
const SPLIT = /[、。,\s]+/
const TRAIL = /(です|でございます|になります)$/

// 発話語 → label に含まれる文字列。左が発話され、右を含む label の欄を hint にする
const SYNONYMS: [string, string][] = [
  ['名前', '氏名'], ['なまえ', '氏名'], ['電話', '電話'], ['メール', 'メール'],
  ['住所', '住所'], ['郵便', '郵便'], ['ふりがな', 'かな'], ['フリガナ', 'カナ'],
]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// 「<ラベル語>は/が/で」の直前でだけ割る。ラベル語は fields の label（全体と先頭 2 文字）と SYNONYMS から作る
function particleSplitter(fields: Field[]): RegExp | null {
  const words = new Set<string>()
  for (const f of fields) {
    const l = f.label.trim()
    if (l.length >= 2) { words.add(l); if (l.length > 2) words.add(l.slice(0, 2)) }
  }
  for (const [spoken] of SYNONYMS) words.add(spoken)
  if (words.size === 0) return null
  const alt = [...words].sort((a, b) => b.length - a.length).map(escapeRe).join('|')
  return new RegExp(`(?=(?:${alt})[はがで])`)
}

// 「幅 (cm)」→「幅」。ラベルの括弧書きは発話されない
const bareLabel = (label: string) => label.replace(/[（(].*?[)）]/g, '').trim()

function stripHint(text: string, fields: Field[]): Chunk {
  const m = /^(.{1,12}?)[はがで](.+)$/.exec(text)
  if (m) {
    const word = m[1]
    const byLabel = fields.find((f) => f.label && (f.label.startsWith(word) || bareLabel(f.label) === word))
    const bySyn = SYNONYMS.find(([spoken]) => word === spoken)
    const target = byLabel ?? (bySyn && fields.find((f) => f.label.includes(bySyn[1])))
    if (target) return { text: m[2], hint: target.label }
  }
  // 助詞なしでラベル語の直後に数字が続く（「幅32センチ」「仕入れ値12万円」）
  const labels = fields.map((f) => [bareLabel(f.label), f.label] as const).filter(([b]) => b.length > 0).sort((a, b) => b[0].length - a[0].length)
  for (const [bare, label] of labels) {
    if (text.length > bare.length && text.startsWith(bare) && /^[\d０-９]/.test(text.slice(bare.length))) return { text: text.slice(bare.length), hint: label }
  }
  // 後置の欄名（「ゴールド金具」→ 金具の色）。ラベルの先頭 2 文字以上が末尾に付いている
  for (const [bare, label] of labels) {
    for (const w of new Set([bare, bare.slice(0, 2)])) {
      if (w.length >= 2 && text.length > w.length && text.endsWith(w)) return { text: text.slice(0, -w.length), hint: label }
    }
  }
  return { text }
}

const DIGITS = /^[\d０-９ ]+$/
const ENDS_DIGIT = /[\d０-９]$/

// 「090 9876 5432」のように区切って読まれた数字を 1 つに戻す
function mergeDigits(parts: string[]): string[] {
  const out: string[] = []
  for (const p of parts) {
    const last = out[out.length - 1]
    if (last !== undefined && ENDS_DIGIT.test(last) && DIGITS.test(p)) out[out.length - 1] = `${last} ${p}`
    else out.push(p)
  }
  return out
}

// 無区切りの発話（「赤革ルイヴィトン」「東京都在住の女性です」）を ICU の単語分割で割る。依存なし、Chrome/Node 内蔵
const PARTICLES = new Set(['の', 'は', 'が', 'を', 'に', 'で', 'と', 'も', 'へ', 'や', 'から', 'まで', 'です', 'ます', 'だ', 'ね', 'よ', 'ください'])
const KATAKANA = /^[ァ-ヺー]+$/
const HIRAGANA = /^[ぁ-ゖー]+$/
const JAPANESE_ONLY = /^[ぁ-ゖァ-ヺー一-龯々〆]+$/   // 英数字・@ を含む chunk（メール等）は割らない
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ja', { granularity: 'word' }) : null

const KANJI = /^[一-龯々〆]+$/
// 否定・除外は語を割ると意味が反転する（「新品ではない」→ 新品）。丸ごと Jev に渡せば「中古」を選べる
const NEGATION = /(ない|なく|以外|じゃな|ではな)/

// ICU は割りすぎるので、隣接（間に助詞を落としていない）なら戻す:
// カタカナ+カタカナ（ブランド名）、ひらがな+ひらがな（読み）、漢字+ひらがな（姓+名の読み）、
// ひらがな+何か（「ほぼ新品」「やや傷」の程度副詞）、辞書（ラベル・選択肢）に合う結合（「保存」+「袋あり」→ 保存袋）
function shouldMerge(prev: string, next: string, dict: string[]): boolean {
  if (KATAKANA.test(prev) && KATAKANA.test(next)) return true
  if (HIRAGANA.test(prev)) return true
  if (/[一-龯々〆]$/.test(prev) && HIRAGANA.test(next)) return true   // 漢字で終わる語 + ひらがな（佐藤+あかね、やや傷+あり）
  const joined = prev + next
  return dict.some((d) => d === joined || d.startsWith(joined) || (joined.startsWith(d) && HIRAGANA.test(joined.slice(d.length))))
}

// 結合の辞書 = 欄ラベル（括弧書きを除く）と選択肢。「赤」のような 1 文字は含めない（「赤革」を戻さないため）
function dictionary(fields: Field[]): string[] {
  const out = new Set<string>()
  for (const f of fields) {
    const b = bareLabel(f.label); if (b.length >= 2) out.add(b)
    for (const o of f.options ?? []) if (o.length >= 2) out.add(o)
  }
  return [...out]
}

function words(text: string, dict: string[]): string[] {
  if (!segmenter) return [text]
  const out: string[] = []
  let adjacent = false   // 直前の token と間に落とした語がないか
  for (const s of segmenter.segment(text)) {
    if (!s.isWordLike || PARTICLES.has(s.segment)) { adjacent = false; continue }
    const last = out[out.length - 1]
    if (adjacent && last !== undefined && shouldMerge(last, s.segment, dict)) out[out.length - 1] = last + s.segment
    else out.push(s.segment)
    adjacent = true
  }
  return out.length ? out : [text]
}

function isLabelWord(text: string, fields: Field[]): boolean {
  return fields.some((f) => f.label === text) || SYNONYMS.some(([spoken]) => spoken === text)
}

// 「幅50高さ60町200」のように「語+数字」が 2 対以上連続する chunk を対に割る。
// 語が欄ラベルならそのラベルを、違えば発話語をそのまま hint にする（「町」→ マチ は Jev の読み判断に任せる）
const PAIR = /([^\d０-９\s]+?)([\d０-９][\d０-９.,万億千]*(?:[a-zA-Z]+|センチ|ミリ|円|個|枚|点|グラム|キロ)?)/gu
function splitPairs(text: string, fields: Field[]): Chunk[] | null {
  const pairs = [...text.matchAll(PAIR)]
  if (pairs.length < 2 || pairs.map((m) => m[0]).join('') !== text) return null
  return pairs.map(([, word, num]) => {
    const f = fields.find((f) => bareLabel(f.label) === word || f.label === word)
    return { text: num, hint: f ? f.label : word }
  })
}

export function segment(text: string, isFinal: boolean, fields: Field[]): Chunk[] {
  if (!isFinal) return []
  const ps = particleSplitter(fields)
  const dict = dictionary(fields)
  // 「12,500」の桁区切りは区切りではない
  return mergeDigits(text.replace(/(\d)[,，](\d{3})(?!\d)/g, '$1$2').split(SPLIT))
    .flatMap((part) => {
      // 「山田太郎で電話は…」のようにラベル語の直前で割れた場合だけ、前側の末尾「で」を落とす
      const parts = ps ? part.split(ps) : [part]
      return parts.map((q, i) => (i < parts.length - 1 ? q.replace(/で$/, '') : q))
    })
    .map((part) => part.replace(TRAIL, ''))
    .filter((part) => part.length > 0 && !PARTICLES.has(part))   // 「の」だけの chunk は捨てる
    .flatMap((part) => splitPairs(part, fields) ?? [stripHint(part, fields)])
    .filter((c) => c.text.length > 0)
    .flatMap((c) => {
      // 欄名だけ・数字・否定はそのまま。それ以外は単語に割り、2 語目以降に glue を付ける
      if (isLabelWord(c.text, fields) || !JAPANESE_ONLY.test(c.text) || HIRAGANA.test(c.text) || NEGATION.test(c.text)) return [c]
      return words(c.text, dict).map((w, i) => (i === 0 ? { ...c, text: w } : { ...c, text: w, glue: true }))
    })
}
