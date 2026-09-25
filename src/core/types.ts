export type FieldKind = 'text' | 'select' | 'radio' | 'checkbox'

export type Field = {
  id: string
  label: string
  kind: FieldKind
  options?: string[]
  type?: string                      // HTML input type（date/time/number/...）。省略は text 扱い
  constraints?: { min?: string; max?: string; step?: string; maxLength?: number; pattern?: string }
}

export type Chunk = {
  text: string
  hint?: string
  glue?: boolean   // 直前の chunk と同じ発話断片から単語分割で生まれた（連結時は空白なし）
  src?: string     // 単語分割前の断片（全単語が同じ自由記述欄に向いたらこれを値にする）
  srcN?: number    // src の語数
}

export type Placement = { fieldId: string; value: string; chunk: string; confidence: number }

export type Question = {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}

export type Answer = {
  type: 'choice'
  choice: string
  probabilities: Record<string, number>
  confidence: number
}

export type JevUsage = { input_tokens: number; output_tokens: number }
export type JevResponse = { answers: Record<string, Answer>; usage?: JevUsage; model?: string }
export type JevAsk = (state: unknown, questions: Record<string, Question>) => Promise<JevResponse>
