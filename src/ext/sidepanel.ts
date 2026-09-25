import { Engine, type EngineEvent, type Host } from '../core/engine'
import { pipeline, type Trace } from '../core/pipeline'
import { startSpeech, type SpeechHandle } from '../web/speech'
import type { Field, JevAsk } from '../core/types'
import { TraceLog } from '../web/tracelog'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const toggle = $<HTMLButtonElement>('toggle'), undoBtn = $<HTMLButtonElement>('undo')
const status = $('status'), interimEl = $('interim'), log = $('log'), sent = $<HTMLPreElement>('sent'), transcript = $('transcript')

// 文字起こしは変換とは別に、そのまま残す
function addTranscript(text: string) {
  const div = document.createElement('div'); div.className = 't'
  const time = document.createElement('small'); time.textContent = new Date().toLocaleTimeString('ja-JP', { hour12: false })
  div.append(time, text)
  transcript.prepend(div)
}

let tabId: number | null = null   // 🎤 開始時に束縛。途中でタブを切り替えても別タブに書かない
async function toTab(msg: unknown) {
  if (tabId === null) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('アクティブタブなし')
    tabId = tab.id
  }
  try {
    return await chrome.tabs.sendMessage(tabId, msg)
  } catch {
    // インストール前から開いていたページには content script が無いので注入して再送
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
    return chrome.tabs.sendMessage(tabId, msg)
  }
}

// Jev は service worker 経由（API キーはそこにしか無い）
const ask: JevAsk = async (state, questions) => {
  const res = await chrome.runtime.sendMessage({ type: 'ask', state, questions })
  if (!res?.ok) throw new Error(res?.error ?? 'unknown')
  return res.answers
}

const host: Host = {
  fields: () => toTab({ type: 'collect' }) as Promise<Field[]>,
  apply: (placement) => toTab({ type: 'apply', placement }) as Promise<{ fieldId: string; prev: string } | null>,
  restore: async (fieldId, prev) => { await toTab({ type: 'restore', fieldId, prev }) },
  route: (input) => pipeline(input, ask),
}

// ページ由来の文字列（欄ラベル・STT）を扱うので innerHTML は使わない
function addLog(text: string, cls = '', strong?: string, small?: string) {
  const div = document.createElement('div')
  div.className = `item ${cls}`
  div.append(text)
  if (strong) { const b = document.createElement('b'); b.textContent = strong; div.append(b) }
  if (small) { const sm = document.createElement('small'); sm.textContent = ` ${small}`; div.append(sm) }
  log.prepend(div)
}

// 文字起こし → 配置の全段階を chrome.storage.local に残す（解析用）。📥 で .jsonl として保存
const traces = new TraceLog({
  load: async () => ((await chrome.storage.local.get('traces')).traces ?? []) as Trace[],
  save: async (t) => { await chrome.storage.local.set({ traces: t }) },
})
const count = $('count'), downloadBtn = $<HTMLButtonElement>('download'), clearBtn = $<HTMLButtonElement>('clear')
void traces.size().then((n) => { count.textContent = `${n} 件` })
downloadBtn.onclick = () => traces.download()
clearBtn.onclick = async () => { await traces.clear(); count.textContent = '0 件' }

function onEvent(ev: EngineEvent) {
  switch (ev.type) {
    case 'trace':
      sent.textContent = JSON.stringify(ev.trace, null, 1)
      void traces.push(ev.trace).then((n) => { count.textContent = `${n} 件` })
      break
    case 'placed': addLog(`${ev.label} ← `, '', ev.value, `(${ev.confidence.toFixed(2)})`); break
    case 'pending': addLog(`${ev.label}: ${ev.value}（桁が足りません。続きを待っています）`, 'none'); break
    case 'rejected': addLog(`${ev.label}: ${ev.value}（形式不正のため未入力）`, 'err'); break
    case 'unplaced': addLog(`未配置: ${ev.text}`, 'none'); break
    case 'waiting': status.textContent = `「${ev.hint}」の値を待っています`; break
    case 'failed': addLog(`書き込み失敗: ${ev.label} ← ${ev.value}`, 'none'); break
    case 'undone': addLog(`取り消し: ${ev.label}`); break
    case 'error': addLog(`エラー: ${ev.message} — 「${ev.text}」は未配置`, 'err'); break
  }
  undoBtn.disabled = !engine.canUndo
}

$('build').textContent = `build ${__BUILD__}（古ければ chrome://extensions で 🔄）`
const engine = new Engine(host, onEvent)
let speech: SpeechHandle | null = null

function stop(msg: string) {
  speech?.stop(); speech = null
  toggle.textContent = '🎤 開始'; status.textContent = msg; interimEl.textContent = ''
}

undoBtn.onclick = () => engine.undo()

toggle.onclick = async () => {
  if (speech) return stop('停止')
  tabId = null
  let fields: Field[]
  try {
    fields = await host.fields()
  } catch {
    status.textContent = 'このページでは使えません（chrome:// や Web Store など）'; return
  }
  if (fields.length === 0) { status.textContent = '入力欄が見つかりません'; return }
  toggle.textContent = '⏹ 停止'
  speech = startSpeech({
    onFinal: (t) => { addTranscript(t); void engine.final(t) },
    onInterim: (t) => { interimEl.textContent = t },
    onStatus: (m) => { status.textContent = m },
    onFatal: (err) => {
      stop(err === 'not-allowed' ? 'マイクが未許可です。許可ページを開きました' : `音声エラー: ${err}`)
      if (err === 'not-allowed') void chrome.tabs.create({ url: chrome.runtime.getURL('grant.html') })
    },
  })
}
