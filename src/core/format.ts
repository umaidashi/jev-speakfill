import { normalize } from './normalize'
import type { Field } from './types'

// 発話 → HTML input type ごとの正規形。Jev は関与しない。
// status: ok=書く / short=桁不足で続き待ち（tel・郵便のみ）/ invalid=書かない
export type Coerced = { value: string; status: 'ok' | 'short' | 'invalid' }
const ok = (value: string): Coerced => ({ value, status: 'ok' })
const invalid = (value: string): Coerced => ({ value, status: 'invalid' })

// 全角→半角。route の連結で入った空白も落とす（「2025年 7月」）
const toHalf = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[／]/g, '/').replace(/[：]/g, ':').replace(/\s+/g, '')
const pad = (n: number) => String(n).padStart(2, '0')
const JST = 9 * 60 * 60 * 1000
const jstDate = (now: number, offsetDays = 0) => new Date(now + JST + offsetDays * 86400000)   // getUTC* で JST の日付を読む

const YEAR_WORDS: Record<string, number> = { 一昨年: -2, 去年: -1, 昨年: -1, 今年: 0, 来年: 1, 再来年: 2 }

// 「来年の8月6日」→ 年のオフセットと残り。「の」は落とす
function splitYearWord(t: string, now: number): { year: number | null; rest: string } {
  const m = /^(一昨年|去年|昨年|今年|来年|再来年)の?(.*)$/.exec(t)
  if (!m) return { year: null, rest: t }
  return { year: jstDate(now).getUTCFullYear() + YEAR_WORDS[m[1]], rest: m[2] }
}

function parseDate(text: string, now: number): { y: number; m: number; d: number } | null {
  const rel = { 今日: 0, 明日: 1, 昨日: -1, 明後日: 2 }[toHalf(text) as '今日']
  if (rel !== undefined) { const j = jstDate(now, rel); return { y: j.getUTCFullYear(), m: j.getUTCMonth() + 1, d: j.getUTCDate() } }
  const { year, rest } = splitYearWord(toHalf(text), now)
  const m = /^(?:(\d{4})[年/])?(\d{1,2})[月/](\d{1,2})日?$/.exec(rest)
  if (!m) return null
  const y = m[1] ? Number(m[1]) : year ?? jstDate(now).getUTCFullYear()
  const r = { y, m: Number(m[2]), d: Number(m[3]) }
  const check = new Date(Date.UTC(r.y, r.m - 1, r.d))
  return check.getUTCMonth() + 1 === r.m && check.getUTCDate() === r.d ? r : null
}

function parseTime(text: string): { h: number; mi: number } | null {
  const t = toHalf(text)
  if (t === '正午') return { h: 12, mi: 0 }
  const m = /^(午前|午後)?(\d{1,2})[時:](?:(\d{1,2})分?|(半))?$/.exec(t)
  if (!m) return null
  let h = Number(m[2])
  const mi = m[4] ? 30 : Number(m[3] ?? 0)
  if (m[1] === '午後' && h < 12) h += 12
  if (m[1] === '午前' && h === 12) h = 0
  return h <= 23 && mi <= 59 ? { h, mi } : null
}

const fmtDate = (d: { y: number; m: number; d: number }) => `${d.y}-${pad(d.m)}-${pad(d.d)}`
const fmtTime = (t: { h: number; mi: number }) => `${pad(t.h)}:${pad(t.mi)}`

function inRange(value: string, c: Field['constraints'], cmp: (a: string, b: string) => number): boolean {
  if (c?.min !== undefined && cmp(value, c.min) < 0) return false
  if (c?.max !== undefined && cmp(value, c.max) > 0) return false
  return true
}

const COLORS: Record<string, string> = {
  赤: '#ff0000', 青: '#0000ff', 黒: '#000000', 白: '#ffffff', 緑: '#008000', 黄: '#ffff00', 黄色: '#ffff00',
  灰: '#808080', 灰色: '#808080', グレー: '#808080', 茶: '#a52a2a', 茶色: '#a52a2a', 紫: '#800080', ピンク: '#ffc0cb', オレンジ: '#ffa500', 紺: '#000080',
}

// HTML の type が無くても、ラベルから数値欄と分かるものは number として扱う（「100円」→ 100）
export const NUMERIC_LABEL = /価格|金額|値段|料金|単価|重量|重さ|数量|個数|在庫|サイズ|寸法|高さ|幅|奥行|長さ/
export const UNIT_BY_LABEL: [RegExp, string][] = [
  [/価格|金額|値段|料金|単価/, '円'],
  [/重量|重さ/, 'g/kg'],
  [/サイズ|寸法|高さ|幅|奥行|長さ/, 'cm/mm'],
  [/数量|個数|在庫/, '個/点/枚'],
]
export const effectiveType = (field: Field) => field.type ?? (NUMERIC_LABEL.test(field.label) ? 'number' : undefined)

export function coerce(text: string, field: Field, now: number): Coerced {
  const c = field.constraints
  const t = text.trim()
  switch (effectiveType(field)) {
    case 'date': {
      const d = parseDate(t, now); if (!d) return invalid(t)
      const v = fmtDate(d); return inRange(v, c, (a, b) => a.localeCompare(b)) ? ok(v) : invalid(v)
    }
    case 'time': {
      const tm = parseTime(t); if (!tm) return invalid(t)
      const v = fmtTime(tm); return inRange(v, c, (a, b) => a.localeCompare(b)) ? ok(v) : invalid(v)
    }
    case 'datetime-local': {
      const m = /^(.+?[日]|今日|明日|昨日|明後日)\s*(.+)$/.exec(toHalf(t)); if (!m) return invalid(t)
      const d = parseDate(m[1], now), tm = parseTime(m[2]); if (!d || !tm) return invalid(t)
      const v = `${fmtDate(d)}T${fmtTime(tm)}`; return inRange(v, c, (a, b) => a.localeCompare(b)) ? ok(v) : invalid(v)
    }
    case 'month': {
      const d = parseDate(t, now)                       // 「来年の12月25日」と日まで言われたら年月だけ使う
      if (d) return ok(`${d.y}-${pad(d.m)}`)
      const { year, rest } = splitYearWord(toHalf(t), now)
      const m = /^(?:(\d{4})[年/])?(\d{1,2})月?$/.exec(rest); if (!m) return invalid(t)
      const mo = Number(m[2]); if (mo < 1 || mo > 12) return invalid(t)
      return ok(`${m[1] ?? year ?? jstDate(now).getUTCFullYear()}-${pad(mo)}`)
    }
    case 'number': case 'range': {
      const n = parseJaNumber(t); if (n === null) return invalid(t)
      const v = String(n)
      if (!inRange(v, c, (a, b) => Number(a) - Number(b))) return invalid(v)
      if (c?.step && c.step !== 'any') { const base = Number(c.min ?? 0); if (Math.abs(((n - base) / Number(c.step)) % 1) > 1e-9) return invalid(v) }
      return ok(v)
    }
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? ok(t) : invalid(t)
    case 'url': return /^https?:\/\/\S+\.\S+$/.test(t) ? ok(t) : invalid(t)
    case 'color': { const v = COLORS[t] ?? (/^#[0-9a-f]{6}$/i.test(t) ? t.toLowerCase() : null); return v ? ok(v) : invalid(t) }
    case 'week': return invalid(t)
    case 'tel': return digitsGate(normalize(t, '電話'), [10, 11])
  }
  // text: 郵便番号・電話はラベルで判定（type=text のことが多い）
  if (/郵便|〒/.test(field.label)) return digitsGate(normalize(t, field.label), [7, 7])
  if (/電話|TEL|tel|携帯|FAX/.test(field.label)) return digitsGate(normalize(t, field.label), [10, 11])
  if (c?.maxLength !== undefined && t.length > c.maxLength) return invalid(t)
  if (c?.pattern) { try { if (!new RegExp(`^(?:${c.pattern})$`, 'u').test(t)) return invalid(t) } catch { /* 壊れた pattern は無視 */ } }
  return ok(t)
}

// 「15万8000円」「1.5万」「3千」「1億2000万」→ 数値。単位（円/センチ/個）は捨てる
export function parseJaNumber(text: string): number | null {
  const s = toHalf(text).replace(/^マイナス/, '-').replace(/[,，]/g, '')
  const m = /^(-?)(?:(\d+(?:\.\d+)?)億)?(?:(\d+(?:\.\d+)?)万)?(?:(\d+(?:\.\d+)?)千)?(\d+(?:\.\d+)?)?/.exec(s)
  if (!m || (m[2] === undefined && m[3] === undefined && m[4] === undefined && m[5] === undefined)) return null
  const n = Number(m[2] ?? 0) * 1e8 + Number(m[3] ?? 0) * 1e4 + Number(m[4] ?? 0) * 1e3 + Number(m[5] ?? 0)
  return m[1] ? -n : n
}

function digitsGate(value: string, [lo, hi]: [number, number]): Coerced {
  const n = value.replace(/[^\d]/g, '').length
  if (n < lo) return { value, status: 'short' }
  if (n > hi) return invalid(value)
  return ok(value)
}
