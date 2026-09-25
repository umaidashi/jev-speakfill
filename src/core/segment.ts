import type { Chunk, Field } from './types'
import { DEFAULT_CONFIG, anyOf, type SpeakfillConfig } from './config'

// ponytail: 日本語ヒューリスティック。境界が誤るケースが出たら spec の B 案（欄ごとの Noul）を none 時 fallback に足す
const SPLIT = /[、。,\s]+/

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// 「<ラベル語>は/が/で」の直前でだけ割る。ラベル語は fields の label（全体と先頭 2 文字）と SYNONYMS から作る
function particleSplitter(fields: Field[], cfg: SpeakfillConfig): RegExp | null {
  const words = new Set<string>()
  for (const f of fields) {
    const l = f.label.trim()
    if (l.length >= 2) { words.add(l); if (l.length > 2) words.add(l.slice(0, 2)) }
  }
  for (const { spoken } of cfg.synonyms) words.add(spoken)
  if (words.size === 0) return null
  const alt = [...words].sort((a, b) => b.length - a.length).map(escapeRe).join('|')
  return new RegExp(`(?=(?:${alt})[はがで])`)
}

// 「幅 (cm)」→「幅」。ラベルの括弧書きは発話されない
const bareLabel = (label: string) => label.replace(/[（(].*?[)）]/g, '').trim()

// 送り仮名を無視した比較用（仕入れ日 → 仕入日）
const okuriganaKey = (s: string) => s.replace(/[ぁ-ゖー]/g, '')

function stripHint(text: string, fields: Field[], cfg: SpeakfillConfig): Chunk {
  // 「仕入れ日は」のように欄名 + 助詞だけ → 欄名そのものに正規化（context が次の値のヒントにする）
  const only = /^(.{1,12}?)[はがで]$/.exec(text)
  if (only) {
    const f = fields.find((f) => bareLabel(f.label) === only[1] || (okuriganaKey(only[1]).length >= 2 && okuriganaKey(bareLabel(f.label)) === okuriganaKey(only[1])))
    if (f) return { text: f.label }
  }
  const m = /^(.{1,12}?)[はがで](.+)$/.exec(text)
  if (m) {
    const word = m[1]
    const byLabel = fields.find((f) => f.label && (f.label.startsWith(word) || bareLabel(f.label) === word || (okuriganaKey(word).length >= 2 && okuriganaKey(bareLabel(f.label)) === okuriganaKey(word))))
    const bySyn = cfg.synonyms.find((x) => x.spoken === word)
    const target = byLabel ?? (bySyn && fields.find((f) => f.label.includes(bySyn.label)))
    if (target) return { text: m[2], hint: target.label }
  }
  // 助詞なしでラベル語の直後に数字が続く（「幅32センチ」「仕入れ値12万円」）
  const labels = fields.map((f) => [bareLabel(f.label), f.label] as const).filter(([b]) => b.length > 0).sort((a, b) => b[0].length - a[0].length)
  for (const [bare, label] of labels) {
    if (text.length > bare.length && text.startsWith(bare) && /^[\d０-９]/.test(text.slice(bare.length))) return { text: text.slice(bare.length), hint: label }
  }
  // 先頭がラベル語そのもの（2 文字以上）で続きがある（「ブランドコーチ」）
  for (const [bare, label] of labels) {
    if (bare.length >= 2 && text.length > bare.length && text.startsWith(bare)) return { text: text.slice(bare.length), hint: label }
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
const KATAKANA = /^[ァ-ヺー]+$/
const HIRAGANA = /^[ぁ-ゖー]+$/
const JAPANESE_ONLY = /^[ぁ-ゖァ-ヺー一-龯々〆]+$/   // 英数字・@ を含む chunk（メール等）は割らない
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ja', { granularity: 'word' }) : null

const KANJI = /^[一-龯々〆]+$/

// ICU は割りすぎるので、隣接（間に助詞を落としていない）なら戻す:
// カタカナ+カタカナ（ブランド名）、ひらがな+ひらがな（読み）、漢字+ひらがな（姓+名の読み）、
// ひらがな+何か（「ほぼ新品」「やや傷」の程度副詞）、辞書（ラベル・選択肢）に合う結合（「保存」+「袋あり」→ 保存袋）
function shouldMerge(prev: string, next: string, dict: string[]): boolean {
  if (KATAKANA.test(prev) && KATAKANA.test(next)) return true
  if (HIRAGANA.test(prev)) return true
  if (/[一-龯々〆ぁ-ゖー]$/.test(prev) && HIRAGANA.test(next)) return true   // 漢字/ひらがなで終わる語 + ひらがな（佐藤+あかね、やや傷+あり、高知ゆう+ご）
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

function words(text: string, dict: string[], particles: Set<string>): string[] {
  if (!segmenter) return [text]
  const out: string[] = []
  let adjacent = false   // 直前の token と間に落とした語がないか
  for (const s of segmenter.segment(text)) {
    if (!s.isWordLike || particles.has(s.segment)) { adjacent = false; continue }
    const last = out[out.length - 1]
    if (adjacent && last !== undefined && shouldMerge(last, s.segment, dict)) out[out.length - 1] = last + s.segment
    else out.push(s.segment)
    adjacent = true
  }
  return out.length ? out : [text]
}

function isLabelWord(text: string, fields: Field[], cfg: SpeakfillConfig): boolean {
  return fields.some((f) => f.label === text) || cfg.synonyms.some((x) => x.spoken === text)
}

// 「幅50高さ60町200」のように「語+数字」が 2 対以上連続する chunk を対に割る。
// 語が欄ラベルならそのラベルを、違えば発話語をそのまま hint にする（「町」→ マチ は Jev の読み判断に任せる）
function pairRegex(cfg: SpeakfillConfig): RegExp {
  const units = ['[a-zA-Z]+', ...cfg.units.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))].join('|')
  return new RegExp(`([^\\d０-９\\s]+?)([\\d０-９][\\d０-９.,万億千]*(?:${units})?)`, 'gu')
}
function splitPairs(text: string, fields: Field[], cfg: SpeakfillConfig): Chunk[] | null {
  const pairs = [...text.matchAll(pairRegex(cfg))]
  if (pairs.length < 2 || pairs.map((m) => m[0]).join('') !== text) return null
  return pairs.map(([, word, num]) => {
    const f = fields.find((f) => bareLabel(f.label) === word || f.label === word)
    return { text: num, hint: f ? f.label : word }
  })
}

export function segment(text: string, isFinal: boolean, fields: Field[], cfg: SpeakfillConfig = DEFAULT_CONFIG): Chunk[] {
  if (!isFinal) return []
  const ps = particleSplitter(fields, cfg)
  const dict = dictionary(fields)
  const particles = new Set(cfg.particles)
  const trail = anyOf(cfg.trailers)
  const negation = anyOf(cfg.negations)
  // 「12,500」の桁区切りは区切りではない
  return mergeDigits(text.replace(/(\d)[,，](\d{3})(?!\d)/g, '$1$2').split(SPLIT))
    .flatMap((part) => {
      // 「山田太郎で電話は…」のようにラベル語の直前で割れた場合だけ、前側の末尾「で」を落とす
      const parts = ps ? part.split(ps) : [part]
      return parts.map((q, i) => (i < parts.length - 1 ? q.replace(/で$/, '') : q))
    })
    .map((part) => (trail ? part.replace(new RegExp(`(?:${trail.source})$`), '') : part))
    .filter((part) => part.length > 0 && !particles.has(part))   // 「の」だけの chunk は捨てる
    .flatMap((part) => splitPairs(part, fields, cfg) ?? [stripHint(part, fields, cfg)])
    .filter((c) => c.text.length > 0)
    .flatMap((c) => {
      // 欄名だけ・数字・否定はそのまま。それ以外は単語に割り、2 語目以降に glue を付ける
      if (isLabelWord(c.text, fields, cfg) || !JAPANESE_ONLY.test(c.text) || HIRAGANA.test(c.text) || (negation && negation.test(c.text))) return [c]
      const ws = words(c.text, dict, particles)
      if (ws.length === 1) return [{ ...c, text: ws[0] }]
      return ws.map((w, i) => (i === 0 ? { ...c, text: w, src: c.text, srcN: ws.length } : { ...c, text: w, glue: true, src: c.text, srcN: ws.length }))
    })
}
