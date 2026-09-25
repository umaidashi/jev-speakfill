import type { Chunk, Field, Question } from './types'
import { effectiveType } from './format'
import { DEFAULT_CONFIG, matchesAny, type SpeakfillConfig } from './config'

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
      instructions:
        `\`chunks[${i}].text\` は日本語フォームのどの入力欄に入れるべき値か。欄名は発話されないことが多い。${cfg.sttNote}` +
        (chunk.hint ? `話者は欄名「${chunk.hint}」を明示した。強く考慮せよ。` : '') +
        `既に \`filled\` にある欄は、値の種類が明らかに一致するときだけ選べ。` +
        `\`recent\` は直前の発話（古い順）。同じ発話内の他の chunk と recent から、この値が何の続きかを読み取れ。` +
        `chunk が値ではなく欄名そのもの（読みが同じ誤変換を含む）なら、その欄を選べ。` +
        (cfg.instructions ? ` ${cfg.instructions}` : ''),
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
    instructions: `\`chunks[${i}].text\` が欄「${f.label}」の値だとしたら、どの選択肢を指しているか。${cfg.sttNote}${cfg.instructions ? ` ${cfg.instructions}` : ''}`,
    criteria: oc,
  }
}
