import { segment } from '../core/segment'
import { route } from '../core/route'
import type { Field, JevAsk, Placement } from '../core/types'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const toggle = $<HTMLButtonElement>('toggle'), undoBtn = $<HTMLButtonElement>('undo')
const status = $('status'), interimEl = $('interim'), log = $('log'), sent = $<HTMLPreElement>('sent')

let listening = false
let fields: Field[] = []
let filled: Record<string, string> = {}
const undoStack: { fieldId: string; prev: string; label: string }[] = []

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('アクティブタブなし')
  return tab.id
}
let tabId: number | null = null   // 🎤 開始時に束縛。途中でタブを切り替えても別タブに書かない
async function toTab(msg: unknown) {
  if (tabId === null) tabId = await activeTabId()
  try {
    return await chrome.tabs.sendMessage(tabId, msg)
  } catch {
    // インストール前から開いていたページには content script が無いので注入して再送
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
    return chrome.tabs.sendMessage(tabId, msg)
  }
}

const ask: JevAsk = async (state, questions) => {
  sent.textContent = JSON.stringify({ state, questions }, null, 1)
  const res = await chrome.runtime.sendMessage({ type: 'ask', state, questions })
  if (!res?.ok) throw new Error(res?.error ?? 'unknown')
  return res.answers
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

async function collect(): Promise<Field[]> {
  const f = (await toTab({ type: 'collect' })) as Field[]
  const alive = new Set(f.map((x) => x.id))
  filled = Object.fromEntries(Object.entries(filled).filter(([id]) => alive.has(id)))  // 消えた欄の filled を捨てる
  return f
}

async function onFinal(text: string) {
  let placements: Placement[]
  try {
    fields = await collect()   // SPA 対策: 確定ごとに取り直す（id は要素ごとに安定）
    const chunks = segment(text, true, fields)
    if (chunks.length === 0) return
    placements = await route(fields, chunks, filled, ask)
    // 連結された chunk（「山田 太郎」）は部分一致で配置済み扱い（ログ用のゆるい判定）
    for (const c of chunks) if (!placements.some((p) => p.chunk.includes(c.text))) addLog(`未配置: ${c.text}`, 'none')
  } catch (e) {
    addLog(`エラー: ${(e as Error).message} — 「${text}」は未配置`, 'err')
    return
  }
  for (const p of placements) {
    const r = (await toTab({ type: 'apply', placement: p })) as { fieldId: string; prev: string } | null
    const label = fields.find((f) => f.id === p.fieldId)?.label ?? p.fieldId
    if (!r) { addLog(`書き込み失敗: ${label} ← ${p.value}`, 'none'); continue }
    filled[p.fieldId] = p.value
    undoStack.push({ ...r, label })
    undoBtn.disabled = false
    addLog(`${label} ← `, '', p.value, `(${p.confidence.toFixed(2)})`)
  }
}

undoBtn.onclick = async () => {
  const last = undoStack.pop()
  if (!last) return
  await toTab({ type: 'restore', fieldId: last.fieldId, prev: last.prev })
  delete filled[last.fieldId]
  addLog(`取り消し: ${last.label}`)
  undoBtn.disabled = undoStack.length === 0
}

// Web Speech。continuous でも Chrome が勝手に onend するので listening 中は再開する（Review Focus 5）。
// ただしマイク拒否・デバイスなしは再開すると無限ループになるので止める。
const SR: { new (): SpeechRecognition } = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition
const FATAL = new Set(['not-allowed', 'audio-capture', 'service-not-allowed', 'language-not-supported', 'network'])  // network は spec どおり停止（再開ループ防止）
let rec: SpeechRecognition | null = null

function stop(msg: string) {
  listening = false; rec?.stop(); rec = null
  toggle.textContent = '🎤 開始'; status.textContent = msg; interimEl.textContent = ''
}

function start() {
  rec = new SR()
  rec.lang = 'ja-JP'; rec.continuous = true; rec.interimResults = true
  rec.onresult = (ev) => {
    let interim = ''
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i]
      if (r.isFinal) { const t = r[0].transcript.trim(); if (t) void onFinal(t) }
      else interim += r[0].transcript
    }
    interimEl.textContent = interim
  }
  rec.onerror = (ev) => {
    if (ev.error === 'not-allowed') {
      stop('マイクが未許可です。許可ページを開きました')
      void chrome.tabs.create({ url: chrome.runtime.getURL('grant.html') })
    } else if (FATAL.has(ev.error)) stop(`音声エラー: ${ev.error}`)
    else status.textContent = `音声エラー: ${ev.error}`
  }
  rec.onend = () => { if (listening) start() }
  rec.start()
  status.textContent = '聞いています…'
}

toggle.onclick = async () => {
  if (listening) return stop('停止')
  tabId = null
  try {
    fields = await collect()
  } catch {
    status.textContent = 'このページでは使えません（chrome:// や Web Store など）'; return
  }
  if (fields.length === 0) { status.textContent = '入力欄が見つかりません'; return }
  listening = true
  toggle.textContent = '⏹ 停止'
  start()
}
