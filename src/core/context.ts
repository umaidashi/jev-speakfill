import { normalize } from './normalize'
import { coerce, effectiveType } from './format'
import { DEFAULT_CONFIG, matchesAny, type SpeakfillConfig } from './config'
import type { Chunk, Field, Placement } from './types'

// 発話をまたぐ文脈。即時配置はそのままに、「欄名だけ」「番号の続き」を後から解釈する
export type Context = {
  hint: string | undefined                                       // 欄名だけが発話された → 次の値のヒント
  last: { fieldId: string; chunk: string; at: number } | undefined  // 直近の配置
}

const NUMERIC = /^[\d０-９\-ー－ ]+$/

function labelFor(text: string, all: Field[], cfg: SpeakfillConfig): string | undefined {
  const fields = all.filter((f) => f.kind !== 'checkbox')   // checkbox はラベル＝値（「箱」でチェック）
  const exact = fields.find((f) => f.label && f.label === text)
  if (exact) return exact.label
  const syn = cfg.synonyms.find((x) => x.spoken === text)
  if (syn) return fields.find((f) => f.label.includes(syn.label))?.label
  // 「発売」→「発売月」のような前方一致。2 文字以上で、候補が 1 つだけのとき
  if (text.length >= 2) {
    const pre = fields.filter((f) => f.label.startsWith(text))
    if (pre.length === 1) return pre[0].label
  }
  return undefined
}

export function applyContext(chunks: Chunk[], fields: Field[], ctx: Context, now: number, cfg: SpeakfillConfig = DEFAULT_CONFIG): { chunks: Chunk[]; direct: Placement[] } {
  const out: Chunk[] = []
  const direct: Placement[] = []
  for (const c of chunks) {
    const label = labelFor(c.text, fields, cfg)
    if (label) { ctx.hint = label; continue }

    const last = ctx.last
    const lastField = last && fields.find((f) => f.id === last.fieldId)
    if (NUMERIC.test(c.text) && last && lastField && matchesAny(cfg.continuationLabels, lastField.label) && now - last.at <= cfg.continueMs) {
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
export function gate(placements: Placement[], fields: Field[], ctx: Context, now: number, cfg: SpeakfillConfig = DEFAULT_CONFIG) {
  const apply: Placement[] = [], pending: Placement[] = [], rejected: Placement[] = [], labelish: Placement[] = []
  for (const p0 of placements) {
    const field = fields.find((f) => f.id === p0.fieldId)
    const c = field && !field.options?.length ? coerce(p0.value, field, now, cfg) : { value: p0.value, status: 'ok' as const }
    const p = { ...p0, value: c.value }
    if (c.status === 'invalid') {
      // 数値・日付欄に数字を含まない値 = 欄名を読んだだけ（「たかさ」）。形式不正ではなく次の値のヒントにする
      const t = field && effectiveType(field, cfg)
      if (field && t && t !== 'email' && t !== 'url' && t !== 'color' && !/[\d０-９]/.test(p.value) && !/今日|明日|昨日|正午/.test(p.value)) { ctx.hint = field.label; ctx.last = undefined; labelish.push(p); continue }
      rejected.push(p); ctx.last = undefined; continue
    }
    if (c.status === 'short') pending.push(p); else apply.push(p)
    ctx.last = { fieldId: p.fieldId, chunk: p.chunk, at: now }
  }
  return { apply, pending, rejected, labelish }   // labelish: 欄名扱いにした chunk（呼び出し側が直後の数字を当てる）
}
