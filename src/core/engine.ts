import type { Context } from './context'
import type { RouteInput, RouteResult } from './pipeline'
import type { Field, Placement } from './types'

// ホストが差し込む 4 関数。DOM / chrome API / HTTP はすべてこの外
export type Host = {
  fields(): Promise<Field[]>
  apply(p: Placement): Promise<{ fieldId: string; prev: string } | null>
  restore(fieldId: string, prev: string): Promise<void>
  route(input: RouteInput): Promise<RouteResult>   // ローカル pipeline+Jev でも、サーバの /route でもよい
}

export type EngineEvent =
  | { type: 'placed'; fieldId: string; label: string; value: string; confidence: number }
  | { type: 'pending'; label: string; value: string }
  | { type: 'rejected'; label: string; value: string }
  | { type: 'unplaced'; text: string }
  | { type: 'waiting'; hint: string }
  | { type: 'failed'; label: string; value: string }    // 欄は決まったが書けなかった
  | { type: 'undone'; label: string }
  | { type: 'error'; message: string; text: string }

// 発話 → 配置の状態機械。filled / ctx / Undo を持つ。final() は直列に処理する
export class Engine {
  private filled: Record<string, string> = {}
  private ctx: Context = { hint: undefined, last: undefined }
  private undoStack: { fieldId: string; prev: string; label: string }[] = []
  private fields: Field[] = []
  private queue: Promise<void> = Promise.resolve()

  constructor(private host: Host, private emit: (ev: EngineEvent) => void, private now: () => number = Date.now) {}

  get canUndo() { return this.undoStack.length > 0 }

  final(text: string): Promise<void> {
    this.queue = this.queue.then(() => this.process(text))
    return this.queue
  }

  private label(fieldId: string) { return this.fields.find((f) => f.id === fieldId)?.label ?? fieldId }

  private async process(text: string) {
    let r: RouteResult
    try {
      this.fields = await this.host.fields()   // SPA 対策: 発話ごとに取り直す（id は要素ごとに安定）
      const alive = new Set(this.fields.map((f) => f.id))
      this.filled = Object.fromEntries(Object.entries(this.filled).filter(([id]) => alive.has(id)))
      r = await this.host.route({ fields: this.fields, text, filled: this.filled, ctx: this.ctx, now: this.now() })
    } catch (e) {
      this.emit({ type: 'error', message: e instanceof Error ? e.message : String(e), text })
      return
    }
    this.ctx = r.ctx
    if (r.hint) this.emit({ type: 'waiting', hint: r.hint })
    for (const t of r.unplaced) this.emit({ type: 'unplaced', text: t })
    for (const p of r.pending) this.emit({ type: 'pending', label: this.label(p.fieldId), value: p.value })
    for (const p of r.rejected) this.emit({ type: 'rejected', label: this.label(p.fieldId), value: p.value })
    for (const p of r.apply) {
      const label = this.label(p.fieldId)
      const done = await this.host.apply(p)
      if (!done) { this.emit({ type: 'failed', label, value: p.value }); continue }
      this.filled[p.fieldId] = p.value
      this.undoStack.push({ ...done, label })
      this.emit({ type: 'placed', fieldId: p.fieldId, label, value: p.value, confidence: p.confidence })
    }
  }

  async undo() {
    const last = this.undoStack.pop()
    if (!last) return
    await this.host.restore(last.fieldId, last.prev)
    if (last.prev) this.filled[last.fieldId] = last.prev; else delete this.filled[last.fieldId]
    this.emit({ type: 'undone', label: last.label })
  }
}
