import type { Field } from './types'
import { DEFAULT_CONFIG, type SpeakfillConfig } from './config'

// Web Speech は複数の文字起こし候補（alternatives）を返せる。第一候補が「尾行」でも第二候補に「備考」があることは多い。
// 欄名・選択肢・同義語・相対日付語が多く含まれる候補を採る（同点なら第一候補。値の文字列を勝手に変えないため）
export function pickTranscript(text: string, alternatives: string[] | undefined, fields: Field[], cfg: SpeakfillConfig = DEFAULT_CONFIG): string {
  if (!alternatives?.length) return text
  const words = new Set<string>()
  for (const f of fields) {
    const bare = f.label.replace(/[（(].*?[)）]/g, '').trim()
    if (bare.length >= 2) words.add(bare)
    for (const o of f.options ?? []) if (o.length >= 2) words.add(o)
  }
  for (const s of cfg.synonyms) words.add(s.spoken)
  for (const w of Object.keys(cfg.relativeDays)) words.add(w)
  const score = (t: string) => [...words].reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0)
  let best = text, bestScore = score(text)
  for (const alt of alternatives) {
    const s = score(alt)
    if (s > bestScore) { best = alt; bestScore = s }
  }
  return best
}
