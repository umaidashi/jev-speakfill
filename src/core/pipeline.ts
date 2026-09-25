import { segment } from './segment'
import { applyContext, gate, type Context } from './context'
import { coerce, effectiveType, fmtDate, isDateLike, localYMD, parseDateSkeleton } from './format'
import { resolveConfig, type SpeakfillConfig } from './config'
import { route } from './route'
import type { Answer, Chunk, Field, JevAsk, JevUsage, Placement, Question } from './types'
import { NONE } from './jev'

// 発話 1 回分を「配置」に変える全段階。ホスト（拡張 / web / サーバ）はこれを呼ぶだけ
export type RouteInput = {
  fields: Field[]
  text: string                      // Web Speech の final
  filled: Record<string, string>    // 入力済み（fieldId → 値）
  ctx: Context                      // 発話をまたぐ文脈（呼び出し側が持ち回る）
  now: number
  recent?: string[]                 // 直前の発話（古い順、最大 3 件）。Jev の state に入れる
  config?: Partial<SpeakfillConfig> // 語彙・閾値・ドメイン説明（core/config.ts）。省略時は DEFAULT
}
export type RouteResult = {
  apply: Placement[]
  pending: Placement[]              // 桁が足りず続き待ち
  rejected: Placement[]             // 形式不正
  unplaced: string[]                // どの欄にも置けなかった chunk
  hint?: string                     // 欄名だけが発話された
  ctx: Context
  trace: Trace
}

// 文字起こしから配置までの全段階。解析用にそのまま保存できる JSON
export type Trace = {
  at: number
  text: string
  filled: Record<string, string>
  ctxBefore: Context
  segment: Chunk[]
  context: { chunks: Chunk[]; direct: Placement[] }
  jev: { state: unknown; questions: Record<string, Question>; answers: Record<string, Answer>; ms: number; usage?: JevUsage; model?: string }[]   // 往復ごとのトークン使用量も残す
  routed: Placement[]               // Jev の答えを採否した直後（gate 前）
  gate: { apply: Placement[]; pending: Placement[]; rejected: Placement[] }
}

export async function pipeline(input: RouteInput, ask: JevAsk): Promise<RouteResult> {
  const ctx: Context = { ...input.ctx }
  const jev: Trace['jev'] = []
  const askTraced: JevAsk = async (state, questions) => {
    const t0 = Date.now()
    const res = await ask(state, questions)
    jev.push({ state, questions, answers: res.answers, ms: Date.now() - t0, usage: res.usage, model: res.model })
    return res
  }
  const cfg = resolveConfig(input.config)
  const seg = segment(input.text, true, input.fields, cfg)
  const { chunks, direct } = applyContext(seg, input.fields, ctx, input.now, cfg)
  const routed = chunks.length ? await route(input.fields, chunks, input.filled, askTraced, input.recent ?? [], cfg) : []
  const g = gate([...direct, ...routed], input.fields, ctx, input.now, cfg)
  // 「町 100」: Jev が「町」を欄名（マチ）と判断したら、同じ発話の直後の数字 chunk をその欄に直接入れる
  for (const lp of g.labelish) {
    const i = chunks.findIndex((c) => c.text === lp.chunk)
    const next = chunks[i + 1]
    const field = input.fields.find((f) => f.id === lp.fieldId)
    if (i < 0 || !next || !field || !/^[\d０-９]/.test(next.text)) continue
    if ([...g.apply, ...g.pending].some((p) => p.chunk === next.text)) continue
    const c = coerce(next.text, field, input.now, cfg)
    const p: Placement = { fieldId: field.id, value: c.value, chunk: next.text, confidence: lp.confidence }
    if (c.status === 'ok') g.apply.push(p); else if (c.status === 'short') g.pending.push(p); else g.rejected.push(p)
    ctx.hint = undefined
    ctx.last = { fieldId: field.id, chunk: next.text, at: input.now }
  }
  await resolveDatesWithJev(g, input, cfg, askTraced)
  const placedChunks = [...g.apply, ...g.pending, ...g.rejected, ...g.labelish].map((p) => p.chunk)
  const unplaced = chunks.filter((c) => !placedChunks.some((t) => t.includes(c.text))).map((c) => c.text)
  const trace: Trace = {
    at: input.now, text: input.text, filled: { ...input.filled }, ctxBefore: { ...input.ctx },
    segment: seg, context: { chunks, direct }, jev, routed, gate: g,
  }
  // hint を返すのは「欄名だけの発話」のとき（chunk が無い、または gate で欄名扱いになった）
  const hint = ctx.hint && ctx.hint !== input.ctx.hint ? ctx.hint : chunks.length === 0 && direct.length === 0 ? ctx.hint : undefined
  return { ...g, unplaced, hint, ctx, trace }
}

// 日付欄で決定的パーサが読めなかった語（「あくる日」「次の年の8月6日」）は、コードが候補の日付を列挙して Jev に選ばせる。
// Jev は日付を生成しない: 候補（今日±3日、または骨格 M月D日 の年違い）から 1 つ選ぶか none
async function resolveDatesWithJev(g: ReturnType<typeof gate>, input: RouteInput, cfg: SpeakfillConfig, ask: JevAsk) {
  const targets = g.rejected.filter((p) => { const f = input.fields.find((f) => f.id === p.fieldId); return f && isDateLike(effectiveType(f, cfg)) && effectiveType(f, cfg) !== 'datetime-local' })
  if (targets.length === 0) return
  const today = localYMD(input.now, cfg.timeZone)
  const questions: Record<string, Question> = {}
  const candidates = new Map<string, Record<string, string>>()
  for (const p of targets) {
    const field = input.fields.find((f) => f.id === p.fieldId)!
    const criteria: Record<string, string> = {}
    const sk = parseDateSkeleton((/(\d{4}[年/])?\d{1,2}[月/]\d{1,2}日?$/.exec(p.chunk.replace(/\s+/g, '')) ?? [''])[0])
    if (sk) {
      for (const off of [-2, -1, 0, 1, 2]) criteria[fmtDate({ y: (sk.y ?? today.y) + off, m: sk.m, d: sk.d })] = `${(sk.y ?? today.y) + off}年${sk.m}月${sk.d}日（今年から ${off >= 0 ? '+' : ''}${off} 年）`
    } else {
      const WD = ['日', '月', '火', '水', '木', '金', '土']
      for (let off = -14; off <= 14; off++) {
        const d = localYMD(input.now, cfg.timeZone, off)
        const wd = WD[new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay()]
        criteria[fmtDate(d)] = `${fmtDate(d)}（${wd}曜日、今日から ${off >= 0 ? '+' : ''}${off} 日）`
      }
    }
    criteria[NONE] = '日付を指していない・候補に無い'
    candidates.set(p.fieldId, criteria)
    questions[`date_${p.fieldId}`] = {
      type: 'choice',
      instructions: `発話「${p.chunk}」は欄「${field.label}」の日付としてどれを指すか。今日は ${fmtDate(today)}。${cfg.sttNote}`,
      criteria,
    }
  }
  const { answers } = await ask({ today: fmtDate(today), chunks: targets.map((p) => p.chunk) }, questions)
  for (const p of targets) {
    const a = answers[`date_${p.fieldId}`]
    if (!a || a.choice === NONE || a.confidence < cfg.threshold || !candidates.get(p.fieldId)?.[a.choice]) continue
    const field = input.fields.find((f) => f.id === p.fieldId)!
    const value = effectiveType(field, cfg) === 'month' ? a.choice.slice(0, 7) : a.choice
    g.rejected.splice(g.rejected.indexOf(p), 1)
    g.apply.push({ ...p, value, confidence: a.confidence })
  }
}
