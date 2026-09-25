import type { Chunk, Field, Question } from './types'
import { effectiveType, UNIT_BY_LABEL } from './format'

export const THRESHOLD = 0.5   // 1 往復目（欄選択）の下限。0.35 だと「バッグ」→氏名 (0.45) のような迷いが通った
export const NONE = 'none'
// 型付き欄は値の見た目を Jev に教える（「今日」が日付欄の値だと分かるように）
const TYPE_HINT: Record<string, string> = {
  date: ' — 「9月25日」「今日」「来年の8月6日」のような日付',
  time: ' — 「15時半」「午後3時」のような時刻',
  'datetime-local': ' — 日付と時刻',
  month: ' — 「2026年9月」「来年の8月」のような年月',
  number: ' — 数値',
  range: ' — 数値',
}
const STT_NOTE = '入力は音声認識の文字起こしで、同音異義の誤変換がありうる（例: 「川」「皮」→「革」）。読みが一致するものを優先せよ。'

// 1 往復目: chunk ごとに「どの欄か」。2 往復目: 選ばれた欄が選択肢を持つときだけ「どの選択肢か」。
// 全欄分の option 質問を投機的に同梱すると入力トークンが 欄数×chunk 数 で膨らむ（実測 1.4 倍、latency 差は ~150ms）ので分ける
export function buildQuestions(fields: Field[], chunks: Chunk[], filled: Record<string, string>, recent: string[] = []) {
  const questions: Record<string, Question> = {}
  chunks.forEach((chunk, i) => {
    const criteria: Record<string, string> = {}
    for (const f of fields) {
      const type = effectiveType(f)
      const unit = UNIT_BY_LABEL.find(([re]) => re.test(f.label))?.[1]
      criteria[f.id] = `${f.label || '(ラベルなし)'} (${f.kind}${f.options ? ': ' + f.options.join('/') : type ? ': ' + type + (TYPE_HINT[type] ?? '') : ''}${unit ? `、単位: ${unit}` : ''})`
    }
    criteria[NONE] = '雑談・指示・どの欄の値でもない'
    questions[`c${i}`] = {
      type: 'choice',
      instructions:
        `\`chunks[${i}].text\` は日本語フォームのどの入力欄に入れるべき値か。欄名は発話されないことが多い。${STT_NOTE}` +
        (chunk.hint ? `話者は欄名「${chunk.hint}」を明示した。強く考慮せよ。` : '') +
        `既に \`filled\` にある欄は、値の種類が明らかに一致するときだけ選べ。` +
        `\`recent\` は直前の発話（古い順）。同じ発話内の他の chunk と recent から、この値が何の続きかを読み取れ。` +
        `chunk が値ではなく欄名そのもの（読みが同じ誤変換を含む。例: 「町」= マチ）なら、その欄を選べ。`,
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
