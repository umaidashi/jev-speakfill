export type FieldKind = 'text' | 'select' | 'radio' | 'checkbox'

export type Field = {
  id: string
  label: string
  kind: FieldKind
  options?: string[]
}

export type Chunk = { text: string; hint?: string }

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
