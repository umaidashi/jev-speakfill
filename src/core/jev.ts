import type { Chunk, Field, Question } from './types'
import { effectiveType } from './format'
import { DEFAULT_CONFIG, fill, matchesAny, type SpeakfillConfig } from './config'

export const NONE = 'none'

// 1 往復目: chunk ごとに「どの欄か」。選択肢は例を数件添えるだけにし、全件は載せない（chunk 数だけ繰り返されて入力が膨らむ）。
// 2 往復目: 1 往復目の確率上位の欄の選択肢を「欄 = 選択肢」に平らに並べ、1 つ選ばせる（欄の迷いも選択肢の迷いも同じ土俵で比べる）
export function buildQuestions(fields: Field[], chunks: Chunk[], filled: Record<string, string>, recent: string[] = [], cfg: SpeakfillConfig = DEFAULT_CONFIG) {
  const questions: Record<string, Question> = {}
  chunks.forEach((chunk, i) => {
    const criteria: Record<string, string> = {}
    for (const f of fields) {
      const type = effectiveType(f, cfg)
      const unit = cfg.unitByLabel.find((u) => matchesAny(u.labels, f.label))?.unit
      criteria[f.id] = `${f.label || '(ラベルなし)'} (${f.kind}${f.options ? ': ' + examples(f, cfg) : type ? ': ' + type + (cfg.typeHints[type] ?? '') : ''}${unit ? `、単位: ${unit}` : ''})`
    }
    // 短い非数値の chunk は「欄名を言っているだけ」の可能性がある（STT の誤変換込み: LINE=ライン、尾行=備考）。
    // 値としての欄に加えて「欄名として」の選択肢を出し、Jev に判定させる
    if (chunk.text.length <= 8 && !/[\d０-９]/.test(chunk.text) && !chunk.hint) {
      for (const f of fields) if (f.kind !== 'checkbox') criteria[`label:${f.id}`] = `欄名「${f.label}」を言っているだけ（値ではない。読みが同じ誤変換も含む）`
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
    fields: fields.map(({ id, label, kind }) => ({ id, label, kind })),
    chunks,
    filled,
    recent,
  }
  return { state, questions }
}

const examples = (f: Field, cfg: SpeakfillConfig) => {
  const opts = f.options ?? []
  return opts.length <= cfg.exampleOptions ? opts.join('/') : `例 ${opts.slice(0, cfg.exampleOptions).join('/')} ほか全 ${opts.length} 件`
}

// 2 往復目の選択肢 id。選択肢を持つ欄は `<欄id>=<選択肢>`、持たない欄は欄 id のまま
export const optionKey = (f: Field, option?: string) => (option === undefined ? f.id : `${f.id}=${option}`)

// Jev の Choice は 1 問あたり 255 択まで。none の分を空けて分割する
export const MAX_CHOICES = 250

// 候補欄を平らに並べた選択肢。250 件を超えたら複数の質問に分ける（同じ往復で聞ける）
export function optionQuestions(i: number, candidates: Field[], cfg: SpeakfillConfig = DEFAULT_CONFIG): Question[] {
  const entries: [string, string][] = []
  for (const f of candidates) {
    if (f.options?.length) for (const o of f.options) entries.push([optionKey(f, o), `${f.label} = ${o}`])
    else entries.push([optionKey(f), `${f.label}（発話をそのまま入れる${effectiveType(f, cfg) ? `。${effectiveType(f, cfg)}` : ''}）`])
  }
  const instructions = fill(cfg.prompts.option, { i: String(i), label: candidates.map((f) => f.label).join('・'), sttNote: cfg.sttNote, instructions: cfg.instructions })
  const out: Question[] = []
  for (let k = 0; k < entries.length; k += MAX_CHOICES) {
    out.push({ type: 'choice', instructions, criteria: { ...Object.fromEntries(entries.slice(k, k + MAX_CHOICES)), [NONE]: 'どれにも当たらない' } })
  }
  return out
}

// 分割して聞いた各組の勝者から 1 つを選び直す質問
export function finalQuestion(i: number, winners: string[], candidates: Field[], cfg: SpeakfillConfig = DEFAULT_CONFIG): Question {
  const all = optionQuestions(i, candidates, cfg).flatMap((q) => Object.entries(q.criteria))
  const byKey = new Map(all)
  return { type: 'choice', instructions: optionQuestions(i, candidates, cfg)[0].instructions, criteria: { ...Object.fromEntries(winners.map((w) => [w, byKey.get(w) ?? w])), [NONE]: 'どれにも当たらない' } }
}

export const optionQuestion = (i: number, candidates: Field[], cfg: SpeakfillConfig = DEFAULT_CONFIG): Question => optionQuestions(i, candidates, cfg)[0]
