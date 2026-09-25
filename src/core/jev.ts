import type { Chunk, Field, Question } from './types'

export const THRESHOLD = 0.35
export const NONE = 'none'
const STT_NOTE = '入力は音声認識の文字起こしで、同音異義の誤変換がありうる（例: 「川」「皮」→「革」）。読みが一致するものを優先せよ。'

// 1 往復目: chunk ごとに「どの欄か」。2 往復目: 選ばれた欄が選択肢を持つときだけ「どの選択肢か」。
// 全欄分の option 質問を投機的に同梱すると入力トークンが 欄数×chunk 数 で膨らむ（実測 1.4 倍、latency 差は ~150ms）ので分ける
export function buildQuestions(fields: Field[], chunks: Chunk[], filled: Record<string, string>) {
  const questions: Record<string, Question> = {}
  chunks.forEach((chunk, i) => {
    const criteria: Record<string, string> = {}
    for (const f of fields) {
      criteria[f.id] = `${f.label || '(ラベルなし)'} (${f.kind}${f.options ? ': ' + f.options.join('/') : f.type ? ': ' + f.type : ''})`
    }
    criteria[NONE] = '雑談・指示・どの欄の値でもない'
    questions[`c${i}`] = {
      type: 'choice',
      instructions:
        `\`chunks[${i}].text\` は日本語フォームのどの入力欄に入れるべき値か。欄名は発話されないことが多い。${STT_NOTE}` +
        (chunk.hint ? `話者は欄名「${chunk.hint}」を明示した。強く考慮せよ。` : '') +
        `既に \`filled\` にある欄は、値の種類が明らかに一致するときだけ選べ。`,
      criteria,
    }
  })
  const state = {
    fields: fields.map(({ id, label, kind, options }) => ({ id, label, kind, options })),
    chunks,
    filled,
  }
  return { state, questions }
}

export function optionQuestion(i: number, f: Field): Question {
  const oc: Record<string, string> = {}
  for (const o of f.options ?? []) oc[o] = o
  oc[NONE] = 'どの選択肢にも当たらない'
  return {
    type: 'choice',
    instructions: `\`chunks[${i}].text\` が欄「${f.label}」の値だとしたら、どの選択肢を指しているか。${STT_NOTE}`,
    criteria: oc,
  }
}
