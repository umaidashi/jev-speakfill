import type { Field } from './types'
import { DEFAULT_CONFIG, matchesAny, type SpeakfillConfig } from './config'

// 発話 → HTML input type ごとの正規形。Jev は関与しない（読めない語の候補選択だけ pipeline が Jev に頼む）。
// status: ok=書く / short=桁不足で続き待ち（tel・zip のみ）/ invalid=書かない
export type Coerced = { value: string; status: 'ok' | 'short' | 'invalid' }
const ok = (value: string): Coerced => ({ value, status: 'ok' })
const invalid = (value: string): Coerced => ({ value, status: 'invalid' })

// 全角→半角。route の連結で入った空白も落とす（「2025年 7月」）
const normalizeText = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[／]/g, '/').replace(/[：]/g, ':').replace(/\s+/g, '')
const pad = (n: number) => String(n).padStart(2, '0')

export type YMD = { y: number; m: number; d: number }

// now（ミリ秒）を timeZone の年月日に。夏時間があっても Intl が面倒を見る
export function localYMD(now: number, timeZone: string, offsetDays = 0): YMD {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now + offsetDays * 86400000))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { y: get('year'), m: get('month'), d: get('day') }
}
export const fmtDate = (d: YMD) => `${d.y}-${pad(d.m)}-${pad(d.d)}`
const fmtTime = (t: { h: number; mi: number }) => `${pad(t.h)}:${pad(t.mi)}`
const validYMD = (r: YMD) => { const c = new Date(Date.UTC(r.y, r.m - 1, r.d)); return c.getUTCMonth() + 1 === r.m && c.getUTCDate() === r.d }

// 「来年の8月6日」→ 年のオフセットと残り。「の」は落とす
function splitYearWord(t: string, cfg: SpeakfillConfig): { offset: number | null; rest: string } {
  for (const [w, off] of Object.entries(cfg.relativeYears).sort((a, b) => b[0].length - a[0].length)) {
    if (t.startsWith(w)) return { offset: off, rest: t.slice(w.length).replace(/^の/, '') }
  }
  return { offset: null, rest: t }
}

// 「8月6日」「2026/9/25」の骨格。年が無ければ null
export function parseDateSkeleton(text: string): { y: number | null; m: number; d: number } | null {
  const m = /^(?:(\d{4})[年/])?(\d{1,2})[月/](\d{1,2})日?$/.exec(normalizeText(text))
  return m ? { y: m[1] ? Number(m[1]) : null, m: Number(m[2]), d: Number(m[3]) } : null
}

export function parseDate(text: string, now: number, cfg: SpeakfillConfig): YMD | null {
  const t = normalizeText(text)
  const rel = cfg.relativeDays[t]
  if (rel !== undefined) return localYMD(now, cfg.timeZone, rel)
  const { offset, rest } = splitYearWord(t, cfg)
  const sk = parseDateSkeleton(rest)
  if (!sk) return null
  const y = sk.y ?? localYMD(now, cfg.timeZone).y + (offset ?? 0)
  const r = { y, m: sk.m, d: sk.d }
  return validYMD(r) ? r : null
}

function parseTime(text: string, cfg: SpeakfillConfig): { h: number; mi: number } | null {
  const t = normalizeText(text)
  if (cfg.noonWords.includes(t)) return { h: 12, mi: 0 }
  const m = /^(午前|午後)?(\d{1,2})[時:](?:(\d{1,2})分?|(半))?$/.exec(t)
  if (!m) return null
  let h = Number(m[2])
  const mi = m[4] ? 30 : Number(m[3] ?? 0)
  if (m[1] === '午後' && h < 12) h += 12
  if (m[1] === '午前' && h === 12) h = 0
  return h <= 23 && mi <= 59 ? { h, mi } : null
}

// 「9月25日15時30分」「明日午後3時」: 時刻は末尾にあるので、末尾から時刻として読める最短の部分を切る
function splitDateTime(t: string, cfg: SpeakfillConfig): [string, string] | null {
  for (let i = 1; i < t.length; i++) if (parseTime(t.slice(i), cfg)) return [t.slice(0, i), t.slice(i)]
  return null
}

function inRange(value: string, c: Field['constraints']): boolean {
  if (c?.min !== undefined && value < c.min) return false   // ISO 形式は文字列比較で順序が正しい
  if (c?.max !== undefined && value > c.max) return false
  return true
}

const digitsOf = (s: string) => normalizeText(s).replace(/[^\d]/g, '')
export const formatPhone = (digits: string) => digits.length === 11
  ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}` : `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
export const formatZip = (digits: string) => `${digits.slice(0, 3)}-${digits.slice(3)}`

// 「15万8000円」「1.5万」「3千」「1億2000万」→ 数値。単位（円/センチ/個）は捨てる
export function parseJaNumber(text: string): number | null {
  const s = normalizeText(text).replace(/^マイナス/, '-').replace(/[,，]/g, '')
  const m = /^(-?)(?:(\d+(?:\.\d+)?)億)?(?:(\d+(?:\.\d+)?)万)?(?:(\d+(?:\.\d+)?)千)?(\d+(?:\.\d+)?)?/.exec(s)
  if (!m || (m[2] === undefined && m[3] === undefined && m[4] === undefined && m[5] === undefined)) return null
  const n = Number(m[2] ?? 0) * 1e8 + Number(m[3] ?? 0) * 1e4 + Number(m[4] ?? 0) * 1e3 + Number(m[5] ?? 0)
  return m[1] ? -n : n
}

// HTML の type が無くても、設定のラベル語から型を推定する（「100円」→ number、「郵便番号」→ zip）
export const effectiveType = (field: Field, cfg: SpeakfillConfig = DEFAULT_CONFIG): string | undefined => {
  if (field.type) return field.type
  if (matchesAny(cfg.zipLabels, field.label)) return 'zip'
  if (matchesAny(cfg.telLabels, field.label)) return 'tel'
  if (matchesAny(cfg.numericLabels, field.label)) return 'number'
  return undefined
}

export const isDateLike = (type: string | undefined) => type === 'date' || type === 'datetime-local' || type === 'month'

export function coerce(text: string, field: Field, now: number, cfg: SpeakfillConfig = DEFAULT_CONFIG): Coerced {
  const c = field.constraints
  const t = text.trim()
  switch (effectiveType(field, cfg)) {
    case 'date': {
      const d = parseDate(t, now, cfg); if (!d) return invalid(t)
      const v = fmtDate(d); return inRange(v, c) ? ok(v) : invalid(v)
    }
    case 'time': {
      const tm = parseTime(t, cfg); if (!tm) return invalid(t)
      const v = fmtTime(tm); return inRange(v, c) ? ok(v) : invalid(v)
    }
    case 'datetime-local': {
      const sp = splitDateTime(normalizeText(t), cfg); if (!sp) return invalid(t)
      const d = parseDate(sp[0], now, cfg), tm = parseTime(sp[1], cfg); if (!d || !tm) return invalid(t)
      const v = `${fmtDate(d)}T${fmtTime(tm)}`; return inRange(v, c) ? ok(v) : invalid(v)
    }
    case 'month': {
      const d = parseDate(t, now, cfg)                  // 「来年の12月25日」と日まで言われたら年月だけ使う
      if (d) return ok(`${d.y}-${pad(d.m)}`)
      const { offset, rest } = splitYearWord(normalizeText(t), cfg)
      const m = /^(?:(\d{4})[年/])?(\d{1,2})月?$/.exec(rest); if (!m) return invalid(t)
      const mo = Number(m[2]); if (mo < 1 || mo > 12) return invalid(t)
      return ok(`${m[1] ?? localYMD(now, cfg.timeZone).y + (offset ?? 0)}-${pad(mo)}`)
    }
    case 'number': case 'range': {
      const n = parseJaNumber(t); if (n === null) return invalid(t)
      const v = String(n)
      if (c?.min !== undefined && n < Number(c.min)) return invalid(v)
      if (c?.max !== undefined && n > Number(c.max)) return invalid(v)
      if (c?.step && c.step !== 'any') { const base = Number(c.min ?? 0); if (Math.abs(((n - base) / Number(c.step)) % 1) > 1e-9) return invalid(v) }
      return ok(v)
    }
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? ok(t) : invalid(t)
    case 'url': return /^https?:\/\/\S+\.\S+$/.test(t) ? ok(t) : invalid(t)
    case 'color': { const v = cfg.colors[t] ?? (/^#[0-9a-f]{6}$/i.test(t) ? t.toLowerCase() : null); return v ? ok(v) : invalid(t) }
    case 'week': return invalid(t)
    case 'tel': { const d = digitsOf(t); return d.length < cfg.telDigits[0] ? { value: t, status: 'short' } : d.length > cfg.telDigits[1] ? invalid(t) : ok(formatPhone(d)) }
    case 'zip': { const d = digitsOf(t); return d.length < cfg.zipDigits[0] ? { value: t, status: 'short' } : d.length > cfg.zipDigits[1] ? invalid(t) : ok(formatZip(d)) }
  }
  if (c?.maxLength !== undefined && t.length > c.maxLength) return invalid(t)
  if (c?.pattern) { try { if (!new RegExp(`^(?:${c.pattern})$`, 'u').test(t)) return invalid(t) } catch { /* 壊れた pattern は無視 */ } }
  return ok(t)
}


