import { segment } from './segment'
import { applyContext, gate, type Context } from './context'
import { route } from './route'
import type { Answer, Chunk, Field, JevAsk, Placement, Question } from './types'

// 発話 1 回分を「配置」に変える全段階。ホスト（拡張 / web / サーバ）はこれを呼ぶだけ
export type RouteInput = {
  fields: Field[]
  text: string                      // Web Speech の final
  filled: Record<string, string>    // 入力済み（fieldId → 値）
  ctx: Context                      // 発話をまたぐ文脈（呼び出し側が持ち回る）
  now: number
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
  const seg = segment(input.text, true, input.fields)
  const { chunks, direct } = applyContext(seg, input.fields, ctx, input.now)
  const routed = chunks.length ? await route(input.fields, chunks, input.filled, askTraced) : []
  const unplaced = chunks.filter((c) => !routed.some((p) => p.chunk.includes(c.text))).map((c) => c.text)
  const g = gate([...direct, ...routed], input.fields, ctx, input.now)
  const trace: Trace = {
    at: input.now, text: input.text, filled: { ...input.filled }, ctxBefore: { ...input.ctx },
    segment: seg, context: { chunks, direct }, jev, routed, gate: g,
  }
  return { ...g, unplaced, hint: chunks.length === 0 && direct.length === 0 ? ctx.hint : undefined, ctx, trace }
}
