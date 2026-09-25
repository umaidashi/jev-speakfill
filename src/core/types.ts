export type FieldKind = 'text' | 'select' | 'radio' | 'checkbox'

export type Field = {
  id: string
  label: string
  kind: FieldKind
  options?: string[]
}

export type Chunk = { text: string; hint?: string; glue?: boolean }  // glue: 直前の chunk と同じ発話断片から単語分割で生まれた（連結時は空白なし）

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

export type JevAsk = (state: unknown, questions: Record<string, Question>) => Promise<Record<string, Answer>>
