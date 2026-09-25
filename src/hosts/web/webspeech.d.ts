// TS の lib.dom は SpeechRecognitionResult 系はあるが SpeechRecognition 本体が無いので、使う分だけ宣言する
interface SpeechRecognitionEvent extends Event { resultIndex: number; results: SpeechRecognitionResultList }
interface SpeechRecognitionErrorEvent extends Event { error: string }
interface SpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
declare var SpeechRecognition: { new (): SpeechRecognition }
declare var webkitSpeechRecognition: { new (): SpeechRecognition }
