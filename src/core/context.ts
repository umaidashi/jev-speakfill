import { normalize } from './normalize'
import { coerce } from './format'
import type { Chunk, Field, Placement } from './types'

// 発話をまたぐ文脈。即時配置はそのままに、「欄名だけ」「番号の続き」を後から解釈する
export type Context = {
  hint: string | undefined                                       // 欄名だけが発話された → 次の値のヒント
  last: { fieldId: string; chunk: string; at: number } | undefined  // 直近の配置
}

const CONTINUE_MS = 5000
const NUMERIC = /^[\d０-９\-ー－ ]+$/
const NUMERIC_FIELD = /電話|TEL|tel|携帯|FAX|郵便|〒|番号/
const SYNONYMS: [string, string][] = [
  ['名前', '氏名'], ['なまえ', '氏名'], ['電話', '電話'], ['メール', 'メール'],
  ['住所', '住所'], ['郵便', '郵便'], ['ふりがな', 'かな'], ['フリガナ', 'カナ'],
]

function labelFor(text: string, fields: Field[]): string | undefined {
  const exact = fields.find((f) => f.label && f.label === text)
  if (exact) return exact.label
  const syn = SYNONYMS.find(([spoken]) => spoken === text)
  return syn && fields.find((f) => f.label.includes(syn[1]))?.label
}

export function applyContext(chunks: Chunk[], fields: Field[], ctx: Context, now: number): { chunks: Chunk[]; direct: Placement[] } {
  const out: Chunk[] = []
  const direct: Placement[] = []
  for (const c of chunks) {
    const label = labelFor(c.text, fields)
    if (label) { ctx.hint = label; continue }

    const last = ctx.last
    const lastField = last && fields.find((f) => f.id === last.fieldId)
    if (NUMERIC.test(c.text) && last && lastField && NUMERIC_FIELD.test(lastField.label) && now - last.at <= CONTINUE_MS) {
      const chunk = `${last.chunk} ${c.text}`
      direct.push({ fieldId: lastField.id, value: normalize(chunk, lastField.label), chunk, confidence: 1 })
      ctx.last = { fieldId: lastField.id, chunk, at: now }
      continue
    }

    const text = NUMERIC.test(c.text) ? c.text.replace(/^[-ー－\s]+/, '') : c.text
    out.push(ctx.hint && !c.hint ? { ...c, text, hint: ctx.hint } : { ...c, text })
    ctx.hint = undefined
  }
  return { chunks: out, direct }
}

export type FormatCheck = 'ok' | 'short' | 'invalid' | 'na'

// 桁数だけで判定する。書く前に短い（続き待ち）/長い（不正）を分ける
export function checkFormat(value: string, label: string): FormatCheck {
  const n = value.replace(/[^\d０-９]/g, '').length
  const range = /郵便|〒/.test(label) ? [7, 7] : /電話|TEL|tel|携帯|FAX/.test(label) ? [10, 11] : null
  if (!range) return 'na'
  if (n < range[0]) return 'short'
  if (n > range[1]) return 'invalid'
  return 'ok'
}

// 型ごとの正規化 + 検証（core/format.ts）を通してから書く
export function gate(placements: Placement[], fields: Field[], ctx: Context, now: number) {
  const apply: Placement[] = [], pending: Placement[] = [], rejected: Placement[] = []
  for (const p0 of placements) {
    const field = fields.find((f) => f.id === p0.fieldId)
    const c = field && !field.options?.length ? coerce(p0.value, field, now) : { value: p0.value, status: 'ok' as const }
    const p = { ...p0, value: c.value }
    if (c.status === 'invalid') { rejected.push(p); ctx.last = undefined; continue }
    if (c.status === 'short') pending.push(p); else apply.push(p)
    ctx.last = { fieldId: p.fieldId, chunk: p.chunk, at: now }
  }
  return { apply, pending, rejected }
}
