// モデルモード: DOM を触らず、アプリのフォーム state に配置する。
// Field[] はフォーム定義から作り、Engine の apply/restore で state を更新する
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Engine, type EngineEvent, type Field, type Host, type RouteInput, type RouteResult, type SpeakfillConfig } from 'jev-speakfill'
import { startSpeech, type SpeechHandle } from 'jev-speakfill/web'

export type FormValues = Record<string, string>

export function useSpeakfill(fields: Field[], endpoint = '/route', config?: Partial<SpeakfillConfig>) {
  const [values, setValues] = useState<FormValues>({})
  const [events, setEvents] = useState<EngineEvent[]>([])
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [status, setStatus] = useState('')     // 音声認識の状態・エラー（止まった理由が見えるように）
  const valuesRef = useRef(values)       // Engine は同期的に前の値を知りたいので ref で持つ
  valuesRef.current = values
  const speech = useRef<SpeechHandle | null>(null)

  const engine = useMemo(() => {
    const host: Host = {
      fields: async () => fields,
      apply: async (p) => {
        const prev = valuesRef.current[p.fieldId] ?? ''
        setValues((v) => ({ ...v, [p.fieldId]: p.value }))
        return { fieldId: p.fieldId, prev }
      },
      restore: async (fieldId, prev) => { setValues((v) => ({ ...v, [fieldId]: prev })) },
      route: async (input: RouteInput) => {
        const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
        const body = await res.json()
        if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`)
        return body as RouteResult
      },
    }
    return new Engine(host, (ev) => setEvents((es) => [ev, ...es].slice(0, 50)), Date.now, config)
  }, [fields, endpoint, config])

  const toggle = useCallback(() => {
    if (speech.current) { speech.current.stop(); speech.current = null; setListening(false); setInterim(''); return }
    speech.current = startSpeech({
      onFinal: (t, alts) => { void engine.final(t, alts) },
      onInterim: setInterim,
      onStatus: setStatus,
      onFatal: (err) => {
        speech.current = null; setListening(false)
        setStatus(`音声認識が停止: ${err}` + (err === 'network' ? '（Chrome の音声サービスに繋がらない。他のタブ・拡張の side panel でマイクを使っていないか確認）' : err === 'not-allowed' ? '（アドレスバー左のアイコンからマイクを許可）' : ''))
      },
    })
    setListening(true)
  }, [engine])

  useEffect(() => () => speech.current?.stop(), [])

  return { values, setValues, events, listening, interim, status, toggle, undo: () => engine.undo(), canUndo: engine.canUndo }
}
