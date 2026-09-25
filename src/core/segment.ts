import type { Chunk, Field } from './types'

// ponytail: 日本語ヒューリスティック。境界が誤るケースが出たら spec の B 案（欄ごとの Noul）を none 時 fallback に足す
const SPLIT = /[、。,\s]+/
const TRAIL = /(です|でございます|になります|だよ|ね|よ)$/

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

// 「090 9876 5432」のように区切って読まれた数字を 1 つに戻す
function mergeDigits(parts: string[]): string[] {
  const out: string[] = []
  for (const p of parts) {
    const last = out[out.length - 1]
    if (last !== undefined && DIGITS.test(last) && DIGITS.test(p)) out[out.length - 1] = `${last} ${p}`
    else out.push(p)
  }
  return out
}

export function segment(text: string, isFinal: boolean, fields: Field[]): Chunk[] {
  if (!isFinal) return []
  const ps = particleSplitter(fields)
  return mergeDigits(text.split(SPLIT))
    .flatMap((part) => (ps ? part.split(ps) : [part]))
    .map((part) => part.replace(TRAIL, '').replace(/[でと]$/, ''))
    .filter((part) => part.length > 0)
    .map((part) => stripHint(part, fields))
    .filter((c) => c.text.length > 0)
}
