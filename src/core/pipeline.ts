import { segment } from './segment'
import { applyContext, gate, type Context } from './context'
import { route } from './route'
import type { Field, JevAsk, Placement } from './types'

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
}

export async function pipeline(input: RouteInput, ask: JevAsk): Promise<RouteResult> {
  const ctx: Context = { ...input.ctx }
  const { chunks, direct } = applyContext(segment(input.text, true, input.fields), input.fields, ctx, input.now)
  const routed = chunks.length ? await route(input.fields, chunks, input.filled, ask) : []
  const unplaced = chunks.filter((c) => !routed.some((p) => p.chunk.includes(c.text))).map((c) => c.text)
  const g = gate([...direct, ...routed], input.fields, ctx, input.now)
  return { ...g, unplaced, hint: chunks.length === 0 && direct.length === 0 ? ctx.hint : undefined, ctx }
}
