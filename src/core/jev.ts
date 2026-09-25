import type { Chunk, Field, Question } from './types'
import { effectiveType } from './format'
import { DEFAULT_CONFIG, fill, matchesAny, type SpeakfillConfig } from './config'

export const NONE = 'none'

// 1 往復目: chunk ごとに「どの欄か」。2 往復目: 選ばれた欄が選択肢を持つときだけ「どの選択肢か」。
// 全欄分の option 質問を投機的に同梱すると入力トークンが 欄数×chunk 数 で膨らむ（実測 1.4 倍、latency 差は ~150ms）ので分ける
export function buildQuestions(fields: Field[], chunks: Chunk[], filled: Record<string, string>, recent: string[] = [], cfg: SpeakfillConfig = DEFAULT_CONFIG) {
  const questions: Record<string, Question> = {}
  chunks.forEach((chunk, i) => {
    const criteria: Record<string, string> = {}
    for (const f of fields) {
      const type = effectiveType(f, cfg)
      const unit = cfg.unitByLabel.find((u) => matchesAny(u.labels, f.label))?.unit
      criteria[f.id] = `${f.label || '(ラベルなし)'} (${f.kind}${f.options ? ': ' + f.options.join('/') : type ? ': ' + type + (cfg.typeHints[type] ?? '') : ''}${unit ? `、単位: ${unit}` : ''})`
    }
    criteria[NONE] = '雑談・指示・どの欄の値でもない'
    questions[`c${i}`] = {
      type: 'choice',
      instructions: fill(cfg.prompts.field, {
        i: String(i),
        hint: chunk.hint ? `話者は欄名「${chunk.hint}」を明示した。強く考慮せよ。` : '',
        sttNote: cfg.sttNote,
        instructions: cfg.instructions,
      }),
      criteria,
    }
  })
  const state = {
    fields: fields.map(({ id, label, kind, options }) => ({ id, label, kind, options })),
    chunks,
    filled,
    recent,
  }
  return { state, questions }
}

export function optionQuestion(i: number, f: Field, cfg: SpeakfillConfig = DEFAULT_CONFIG): Question {
  const oc: Record<string, string> = {}
  for (const o of f.options ?? []) oc[o] = o
  oc[NONE] = 'どの選択肢にも当たらない'
  return {
    type: 'choice',
    instructions: fill(cfg.prompts.option, { i: String(i), label: f.label, sttNote: cfg.sttNote, instructions: cfg.instructions }),
    criteria: oc,
  }
}
