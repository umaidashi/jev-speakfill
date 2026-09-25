// 任意のページに <script src="widget.js"> で後付けするフロートボタン（DOM モード）。
// 欄の収集と書き込みはページの DOM、ルーティングはサーバの /route（Jev キーはサーバにしか無い）
import { Engine, type EngineEvent, type Host } from '../core/engine'
import { applyPlacement, collectFields, restore } from '../dom'
import { startSpeech, type SpeechHandle } from './speech'
import type { RouteResult } from '../core/pipeline'
import { TraceLog, localStorageStore } from './tracelog'
import type { SpeakfillConfig } from '../core/config'

const script = document.currentScript as HTMLScriptElement | null
const endpoint = script?.dataset.endpoint ?? '/route'
// 語彙・ヒント設定: <script data-config='{...}'> か window.speakfillConfig。無ければサーバ側の設定だけ
let config: Partial<SpeakfillConfig> | undefined
try { config = script?.dataset.config ? JSON.parse(script.dataset.config) : (window as any).speakfillConfig } catch { config = undefined }

const host: Host = {
  fields: async () => collectFields(document, { excludeLabels: config?.excludeLabels, maxFields: config?.maxFields }),
  apply: async (p) => applyPlacement(p),
  restore: async (id, prev) => restore(id, prev),
  route: async (input) => {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    const body = await res.json()
    if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`)
    return body as RouteResult
  },
}

// UI: 右下のフロートボタン + 小さなログ
const root = document.createElement('div')
root.setAttribute('style', 'position:fixed;right:16px;bottom:16px;z-index:2147483647;font:13px system-ui;display:flex;flex-direction:column;align-items:flex-end;gap:6px')
const panel = document.createElement('div')
panel.setAttribute('style', 'display:none;width:280px;max-height:240px;overflow:auto;background:#fff;border:1px solid #ccc;border-radius:8px;padding:8px;box-shadow:0 4px 16px rgba(0,0,0,.15)')
const status = document.createElement('div'); status.setAttribute('style', 'color:#666;margin-bottom:4px')
const interim = document.createElement('div'); interim.setAttribute('style', 'color:#999;min-height:1.2em')
const transcript = document.createElement('div'); transcript.setAttribute('style', 'max-height:80px;overflow:auto;color:#333;border-bottom:1px solid #ddd;margin-bottom:4px')
const log = document.createElement('div')
function addTranscript(text: string) {
  const div = document.createElement('div'); div.textContent = `${new Date().toLocaleTimeString('ja-JP', { hour12: false })} ${text}`
  transcript.prepend(div)
}
const undoBtn = document.createElement('button'); undoBtn.textContent = '↩ 取り消し'; undoBtn.disabled = true
const dlBtn = document.createElement('button'); dlBtn.textContent = '📥 ログ'; dlBtn.title = '文字起こし→配置の全段階を .jsonl で保存'
panel.append(status, interim, transcript, undoBtn, dlBtn, log)
const traces = new TraceLog(localStorageStore())
dlBtn.onclick = () => traces.download()
const fab = document.createElement('button')
fab.textContent = '🎤'; fab.title = `jev-speakfill build ${__BUILD__}`
fab.setAttribute('style', 'width:56px;height:56px;border-radius:50%;border:none;background:#1a73e8;color:#fff;font-size:24px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3)')
root.append(panel, fab)
document.body.append(root)

function addLog(text: string, color = '#000') {
  const div = document.createElement('div'); div.textContent = text; div.style.color = color; div.style.borderTop = '1px solid #eee'; div.style.padding = '2px 0'
  log.prepend(div)
}
function onEvent(ev: EngineEvent) {
  switch (ev.type) {
    case 'trace': console.debug('[jev-speakfill] trace', ev.trace); void traces.push(ev.trace); break
    case 'placed': addLog(`${ev.label} ← ${ev.value} (${ev.confidence.toFixed(2)})`); break
    case 'pending': addLog(`${ev.label}: ${ev.value}（続きを待っています）`, '#a60'); break
    case 'rejected': addLog(`${ev.label}: ${ev.value}（形式不正）`, '#a00'); break
    case 'unplaced': addLog(`未配置: ${ev.text}`, '#999'); break
    case 'waiting': status.textContent = `「${ev.hint}」の値を待っています`; break
    case 'failed': addLog(`書き込み失敗: ${ev.label}`, '#a00'); break
    case 'undone': addLog(`取り消し: ${ev.label}`); break
    case 'error': addLog(`エラー: ${ev.message}`, '#a00'); break
  }
  undoBtn.disabled = !engine.canUndo
}
const engine = new Engine(host, onEvent, Date.now, config)
let speech: SpeechHandle | null = null
undoBtn.onclick = () => engine.undo()
fab.onclick = () => {
  if (speech) { speech.stop(); speech = null; fab.style.background = '#1a73e8'; status.textContent = '停止'; interim.textContent = ''; return }
  panel.style.display = 'block'
  fab.style.background = '#d93025'
  speech = startSpeech({
    onFinal: (t) => { addTranscript(t); void engine.final(t) },
    onInterim: (t) => { interim.textContent = t },
    onStatus: (m) => { status.textContent = m },
    onFatal: (err) => { speech = null; fab.style.background = '#1a73e8'; status.textContent = `音声エラー: ${err}` },
  })
}
