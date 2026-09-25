import { buildQuestions, NONE, THRESHOLD, optionQuestion } from './jev'
import { normalize } from './normalize'
import type { Chunk, Field, JevAsk, Placement, Question } from './types'

export async function route(fields: Field[], chunks: Chunk[], filled: Record<string, string>, ask: JevAsk): Promise<Placement[]> {
  if (chunks.length === 0 || fields.length === 0) return []
  const { state, questions } = buildQuestions(fields, chunks, filled)
  const answers = await ask(state, questions)
  // 1 往復目で選ばれた欄のうち、選択肢を持つものだけ 2 往復目で option を選ぶ
  const chosen = chunks.map((_, i) => {
    const a = answers[`c${i}`]
    if (!a || a.choice === NONE || a.confidence < THRESHOLD) return undefined
    return fields.find((f) => f.id === a.choice)
  })
  const optQ: Record<string, Question> = {}
  chosen.forEach((f, i) => { if (f?.options?.length) optQ[`c${i}_${f.id}`] = optionQuestion(i, f) })
  const optAnswers = Object.keys(optQ).length ? await ask(state, optQ) : {}
  const out: Placement[] = []
  const optConf = new Map<Placement, number>()
  chunks.forEach((chunk, i) => {
    const field = chosen[i]
    if (!field) return
    const a = answers[`c${i}`]
    let value: string
    if (field.options?.length) {
      const opt = optAnswers[`c${i}_${field.id}`]
      if (!opt || opt.choice === NONE) return
      value = opt.choice
      // 同じ選択肢欄に隣接 chunk が向いたら（「ほぼ」「新品」）、選択肢の confidence が高い方だけ残す
      const last = out[out.length - 1]
      if (last && last.fieldId === field.id) {
        if (opt.confidence > (optConf.get(last) ?? 0)) { out.pop(); optConf.delete(last) } else return
      }
      const p: Placement = { fieldId: field.id, value, chunk: chunk.text, confidence: a.confidence }
      out.push(p); optConf.set(p, opt.confidence)
      return
    } else {
      value = normalize(chunk.text, field.label)
    }
    const last = out[out.length - 1]
    // 「山田 太郎」のように STT が 1 つの値を空白で割ったとき、隣接 chunk が同じ text 欄なら連結する
    if (last && last.fieldId === field.id && !field.options?.length) {
      const joined = chunk.glue ? `${last.chunk}${chunk.text}` : `${last.chunk} ${chunk.text}`
      last.value = normalize(joined, field.label)
      last.chunk = joined
      last.confidence = Math.min(last.confidence, a.confidence)
      return
    }
    out.push({ fieldId: field.id, value, chunk: chunk.text, confidence: a.confidence })
  })
  return out
}
