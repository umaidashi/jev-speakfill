import type { Trace } from '../core/pipeline'

// トレースの保存・ダウンロード。永続化先はホストが差し込む（拡張: chrome.storage、web: localStorage）
const MAX = 500

export class TraceLog {
  constructor(private store: { load(): Promise<Trace[]>; save(t: Trace[]): Promise<void> }) {}

  async push(t: Trace): Promise<number> {
    const all = [...(await this.store.load()), t].slice(-MAX)
    await this.store.save(all)
    return all.length
  }
  async size() { return (await this.store.load()).length }
  async clear() { await this.store.save([]) }

  // 1 行 1 発話の JSON Lines。jq / pandas でそのまま読める
  async download(name = `jev-speakfill-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jsonl`) {
    const lines = (await this.store.load()).map((t) => JSON.stringify(t)).join('\n') + '\n'
    const url = URL.createObjectURL(new Blob([lines], { type: 'application/x-ndjson' }))
    const a = document.createElement('a'); a.href = url; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export const localStorageStore = (key = 'jev-speakfill-traces') => ({
  load: async () => { try { return JSON.parse(localStorage.getItem(key) ?? '[]') as Trace[] } catch { return [] } },
  save: async (t: Trace[]) => { try { localStorage.setItem(key, JSON.stringify(t)) } catch { /* 容量超過などは無視 */ } },
})
