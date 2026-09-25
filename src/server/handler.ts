import { pipeline, type RouteInput } from '../core/pipeline'
import type { JevAsk } from '../core/types'
import type { SpeakfillConfig } from '../core/config'

// POST /route の本体。HTTP から切り離してテストする。Jev キーは ask に閉じ込める
export async function handleRoute(body: string, ask: JevAsk, baseConfig: Partial<SpeakfillConfig> = {}): Promise<{ status: number; body: any }> {
  let input: RouteInput
  try {
    input = JSON.parse(body)
    if (!Array.isArray(input.fields) || typeof input.text !== 'string') throw new Error('bad input')
  } catch {
    return { status: 400, body: { message: 'fields(配列) と text(文字列) が必要です' } }
  }
  input.filled ??= {}
  input.ctx = { hint: input.ctx?.hint ?? undefined, last: input.ctx?.last ?? undefined }
  input.now ??= Date.now()
  input.recent = Array.isArray(input.recent) ? input.recent.slice(-3).map(String) : []
  input.config = { ...baseConfig, ...(input.config ?? {}) }   // サーバの設定ファイル < リクエスト
  try {
    return { status: 200, body: await pipeline(input, ask) }
  } catch (e) {
    return { status: 502, body: { message: e instanceof Error ? e.message : String(e) } }
  }
}
