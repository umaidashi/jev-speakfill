// TS の lib.dom は SpeechRecognitionResult 系はあるが SpeechRecognition 本体が無い。パッケージの .d.ts に含めるため module 型として持つ
export interface SpeechRecognitionEventLike extends Event { resultIndex: number; results: SpeechRecognitionResultList }
export interface SpeechRecognitionErrorEventLike extends Event { error: string }
export interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
export type SpeechRecognitionCtor = { new (): SpeechRecognitionLike }
