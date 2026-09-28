// 既存 UI に後付けするフロート UI。フォーム側は何も知らない（opt-in）。
// 右下の 🎤 で開始/停止、パネルに認識中テキスト・状態・配置ログ・取り消し
import { useState } from 'react'
import type { useSpeakfill } from './useSpeakfill'

type Props = ReturnType<typeof useSpeakfill>

export function SpeakfillFab(sf: Props) {
  const [open, setOpen] = useState(false)
  const fab: React.CSSProperties = {
    width: 56, height: 56, borderRadius: '50%', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer',
    background: sf.listening ? '#d93025' : '#1a73e8', boxShadow: '0 4px 12px rgba(0,0,0,.3)',
  }
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 2147483647, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, font: '13px system-ui' }}>
      {open && (
        <div style={{ width: 300, maxHeight: 320, overflow: 'auto', background: '#fff', border: '1px solid #ccc', borderRadius: 8, padding: 10, boxShadow: '0 4px 16px rgba(0,0,0,.15)' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <button onClick={sf.undo} disabled={!sf.canUndo}>↩ 取り消し</button>
            <span style={{ color: sf.status.startsWith('音声認識が停止') ? '#a00' : '#666', fontSize: 12 }}>{sf.status || (sf.listening ? '聞いています…' : '停止中')}</span>
          </div>
          <div style={{ color: '#999', minHeight: '1.2em' }}>{sf.interim}</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12 }}>
            {sf.events.filter((e) => e.type !== 'trace').slice(0, 12).map((ev, i) => <li key={i}>{describe(ev)}</li>)}
          </ul>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button onClick={() => setOpen((o) => !o)} title="ログ" style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>{open ? '×' : '…'}</button>
        <button onClick={() => { sf.toggle(); if (!sf.listening) setOpen(true) }} style={fab} title={sf.listening ? '停止' : '音声入力を開始'}>🎤</button>
      </div>
    </div>
  )
}

function describe(ev: Props['events'][number]): string {
  switch (ev.type) {
    case 'placed': return `${ev.label} ← ${ev.value} (${ev.confidence.toFixed(2)})`
    case 'pending': return `${ev.label}: ${ev.value}（続き待ち）`
    case 'rejected': return `${ev.label}: ${ev.value}（形式不正）`
    case 'unplaced': return `未配置: ${ev.text}`
    case 'waiting': return `「${ev.hint}」の値を待っています`
    case 'failed': return `書き込み失敗: ${ev.label}`
    case 'undone': return `取り消し: ${ev.label}`
    case 'error': return `エラー: ${ev.message}`
    case 'trace': return ''
  }
}
