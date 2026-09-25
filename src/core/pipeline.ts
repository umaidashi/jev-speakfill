import { segment } from './segment'
import { applyContext, gate, type Context } from './context'
import { coerce } from './format'
import { resolveConfig, type SpeakfillConfig } from './config'
import { route } from './route'
import type { Answer, Chunk, Field, JevAsk, Placement, Question } from './types'

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
  jev: { state: unknown; questions: Record<string, Question>; answers: Record<string, Answer>; ms: number }[]
  routed: Placement[]               // Jev の答えを採否した直後（gate 前）
  gate: { apply: Placement[]; pending: Placement[]; rejected: Placement[] }
}

export async function pipeline(input: RouteInput, ask: JevAsk): Promise<RouteResult> {
  const ctx: Context = { ...input.ctx }
  const jev: Trace['jev'] = []
  const askTraced: JevAsk = async (state, questions) => {
    const t0 = Date.now()
    const answers = await ask(state, questions)
    jev.push({ state, questions, answers, ms: Date.now() - t0 })
    return answers
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
