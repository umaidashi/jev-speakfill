import { buildQuestions, NONE, optionQuestion } from './jev'
import { DEFAULT_CONFIG, type SpeakfillConfig } from './config'
import { effectiveType } from './format'
import type { Chunk, Field, JevAsk, Placement, Question } from './types'

export async function route(fields: Field[], chunks: Chunk[], filled: Record<string, string>, ask: JevAsk, recent: string[] = [], cfg: SpeakfillConfig = DEFAULT_CONFIG): Promise<Placement[]> {
  if (chunks.length === 0 || fields.length === 0) return []
  const { state, questions } = buildQuestions(fields, chunks, filled, recent, cfg)
  const { answers } = await ask(state, questions)
  // 1 往復目で選ばれた欄のうち、選択肢を持つものだけ 2 往復目で option を選ぶ
  const chosen = chunks.map((_, i) => {
    const a = answers[`c${i}`]
    if (!a || a.choice === NONE || a.confidence < cfg.threshold) return undefined
    return fields.find((f) => f.id === a.choice)
  })
  const optQ: Record<string, Question> = {}
  chosen.forEach((f, i) => { if (f?.options?.length) optQ[`c${i}_${f.id}`] = optionQuestion(i, f, cfg) })
  const optAnswers = Object.keys(optQ).length ? (await ask(state, optQ)).answers : {}
  const out: Placement[] = []
  const optConf = new Map<Placement, number>()
  const merged = new Map<Placement, number>()   // 連結した語数
  chunks.forEach((chunk, i) => {
    const field = chosen[i]
    if (!field) return
    const a = answers[`c${i}`]
    let value: string
    if (field.options?.length) {
      const opt = optAnswers[`c${i}_${field.id}`]
      if (!opt || opt.choice === NONE || opt.confidence < cfg.optionThreshold) return
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
      value = chunk.text   // 整形・検証は gate の coerce
    }
    const last = out[out.length - 1]
    // 「山田 太郎」のように STT が 1 つの値を空白で割ったとき、隣接 chunk が同じ text 欄なら連結する。
    // 数値・日付欄は連結しない（「町」「100」→「町 100」にすると数値にならない）
    if (last && last.fieldId === field.id && !field.options?.length && !effectiveType(field, cfg)) {
      const joined = chunk.glue ? `${last.chunk}${chunk.text}` : `${last.chunk} ${chunk.text}`
      const n = (merged.get(last) ?? 1) + 1
      merged.set(last, n)
      // 断片の全単語が同じ欄に向いたら、助詞込みの元の文をそのまま使う（「底面に傷あり」）
      const whole = chunk.src && chunk.srcN === n ? chunk.src : joined
      last.value = whole
      last.chunk = whole
      last.confidence = Math.min(last.confidence, a.confidence)
      return
    }
    out.push({ fieldId: field.id, value, chunk: chunk.text, confidence: a.confidence })
  })
  return out
}
