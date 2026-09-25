// Web Speech の薄い包み。final だけをコールバックし、interim は表示用に返す。continuous の勝手な onend は再開する
export type SpeechHandle = { stop(): void }
export type SpeechCallbacks = {
  onFinal(text: string): void
  onInterim(text: string): void
  onStatus(msg: string): void
  onFatal(error: string): void   // マイク拒否など。再開すると無限ループになる種類
}
const FATAL = new Set(['not-allowed', 'audio-capture', 'service-not-allowed', 'language-not-supported', 'network'])

export function startSpeech(cb: SpeechCallbacks, lang = 'ja-JP'): SpeechHandle {
  const SR: { new (): SpeechRecognition } = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition
  let listening = true
  let rec: SpeechRecognition | null = null
  const start = () => {
    rec = new SR()
    rec.lang = lang; rec.continuous = true; rec.interimResults = true
    rec.onresult = (ev) => {
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) { const t = r[0].transcript.trim(); if (t) cb.onFinal(t) }
        else interim += r[0].transcript
      }
      cb.onInterim(interim)
    }
    rec.onerror = (ev) => {
      if (FATAL.has(ev.error)) { listening = false; cb.onFatal(ev.error) }
      else cb.onStatus(`音声エラー: ${ev.error}`)
    }
    rec.onend = () => { if (listening) start() }
    rec.start()
    cb.onStatus('聞いています…')
  }
  start()
  return { stop() { listening = false; rec?.stop(); rec = null } }
}
