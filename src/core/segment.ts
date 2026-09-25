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

function stripHint(text: string, fields: Field[]): Chunk {
  const m = /^(.{1,12}?)[はがで](.+)$/.exec(text)
  if (!m) return { text }
  const word = m[1]
  const byLabel = fields.find((f) => f.label && f.label.startsWith(word))
  const bySyn = SYNONYMS.find(([spoken]) => word === spoken)
  const target = byLabel ?? (bySyn && fields.find((f) => f.label.includes(bySyn[1])))
  return target ? { text: m[2], hint: target.label } : { text }
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

// ICU は割りすぎるので、隣接（間に助詞を落としていない）なら戻す:
// カタカナ+カタカナ（ブランド名）、ひらがな+ひらがな（読み）、漢字+ひらがな（姓+名の読み）
function shouldMerge(prev: string, next: string): boolean {
  if (KATAKANA.test(prev) && KATAKANA.test(next)) return true
  if (HIRAGANA.test(prev) && HIRAGANA.test(next)) return true
  if (KANJI.test(prev) && HIRAGANA.test(next)) return true
  return false
}

function words(text: string): string[] {
  if (!segmenter) return [text]
  const out: string[] = []
  let adjacent = false   // 直前の token と間に落とした語がないか
  for (const s of segmenter.segment(text)) {
    if (!s.isWordLike || PARTICLES.has(s.segment)) { adjacent = false; continue }
    const last = out[out.length - 1]
    if (adjacent && last !== undefined && shouldMerge(last, s.segment)) out[out.length - 1] = last + s.segment
    else out.push(s.segment)
    adjacent = true
  }
  return out.length ? out : [text]
}

function isLabelWord(text: string, fields: Field[]): boolean {
  return fields.some((f) => f.label === text) || SYNONYMS.some(([spoken]) => spoken === text)
}

export function segment(text: string, isFinal: boolean, fields: Field[]): Chunk[] {
  if (!isFinal) return []
  const ps = particleSplitter(fields)
  return mergeDigits(text.split(SPLIT))
    .flatMap((part) => {
      // 「山田太郎で電話は…」のようにラベル語の直前で割れた場合だけ、前側の末尾「で」を落とす
      const parts = ps ? part.split(ps) : [part]
      return parts.map((q, i) => (i < parts.length - 1 ? q.replace(/で$/, '') : q))
    })
    .map((part) => part.replace(TRAIL, ''))
    .filter((part) => part.length > 0)
    .map((part) => stripHint(part, fields))
    .filter((c) => c.text.length > 0)
    .flatMap((c) => {
      // 欄名だけ・数字はそのまま。それ以外は単語に割り、2 語目以降に glue を付ける
      if (isLabelWord(c.text, fields) || !JAPANESE_ONLY.test(c.text) || HIRAGANA.test(c.text)) return [c]
      return words(c.text).map((w, i) => (i === 0 ? { ...c, text: w } : { ...c, text: w, glue: true }))
    })
}
