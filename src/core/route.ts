import { buildQuestions, MAX_CHOICES, NONE, optionKey, optionQuestion } from './jev'
import { DEFAULT_CONFIG, type SpeakfillConfig } from './config'
import { effectiveType } from './format'
import type { Chunk, Field, JevAsk, Placement, Question } from './types'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// 「備考欄は底面に傷あり」→「底面に傷あり」。hint の欄名（括弧書き除く）+ 欄? + 助詞? を先頭から落とす
function stripLabel(src: string, hint?: string): string {
  if (!hint) return src
  const bare = hint.replace(/[（(].*?[)）]/g, '').trim()
  return src.replace(new RegExp(`^${esc(bare)}欄?[はがで]?`), '').replace(/^[はがで](?=.)/, '')
}

// route が本体以外に返す情報: 欄名と判定された chunk の位置と、発話末尾の欄名（次の発話のヒント）
export type RouteMeta = { pendingHint?: string; labelAt: number[] }

const choices = (f: Field) => f.options?.length || 1

export async function route(fields: Field[], chunks: Chunk[], filled: Record<string, string>, ask: JevAsk, recent: string[] = [], cfg: SpeakfillConfig = DEFAULT_CONFIG, meta: RouteMeta = { labelAt: [] }): Promise<Placement[]> {
  if (chunks.length === 0 || fields.length === 0) return []
  const tooMany = fields.find((f) => (f.options?.length ?? 0) > MAX_CHOICES)
  if (tooMany) throw new Error(`欄「${tooMany.label}」の選択肢が ${tooMany.options!.length} 件ある。Jev は 1 問 ${MAX_CHOICES + 1} 択までなので、発話に近い候補に絞って渡すこと`)
  const { state, questions } = buildQuestions(fields, chunks, filled, recent, cfg)
  const { answers } = await ask(state, questions)
  // Jev が「欄名を言っているだけ」と判定した chunk: 続く chunk（同じ断片の残り）をその欄の値にする。末尾なら次の発話のヒント
  const labelOf = new Map<number, Field>()
  const swallowed = new Set<number>()
  chunks.forEach((c, i) => {
    const a = answers[`c${i}`]
    if (!a || !a.choice.startsWith('label:') || a.confidence < cfg.threshold) return
    const f = fields.find((f) => f.id === a.choice.slice(6)); if (!f) return
    labelOf.set(i, f); meta.labelAt.push(i)
    const next = chunks[i + 1]
    if (!next) { meta.pendingHint = f.label; return }
    if (next.src && !f.options?.length && !effectiveType(f, cfg)) for (let j = i + 2; j < chunks.length && chunks[j].src === next.src; j++) swallowed.add(j)   // 自由記述: 断片の残りをまとめる
  })
  // 1 往復目で選ばれた欄。欄名・hint で決まったものは 2 往復目でも動かさない
  const forced = new Set<number>()
  // 1 往復目で閾値に届かないが none でもない chunk。選択肢の全件を見せていないので確信が下がる。2 往復目で比べ直させる
  const unsure = new Set<number>()
  const chosen = chunks.map((chunk, i) => {
    if (labelOf.has(i) || swallowed.has(i)) return undefined
    const byLabel = labelOf.get(i - 1)
    if (byLabel) { forced.add(i); return byLabel }
    const a = answers[`c${i}`]
    if (a && a.choice !== NONE && !a.choice.startsWith('label:') && a.confidence >= cfg.threshold) return fields.find((f) => f.id === a.choice)
    if (a && a.choice !== NONE && !a.choice.startsWith('label:') && a.confidence >= cfg.topFieldMin && !chunk.hint) { unsure.add(i); return fields.find((f) => f.id === a.choice) }
    // 話者が欄名を言っている（hint）なら、Jev が迷っても hint の欄を信じる
    if (chunk.hint) { forced.add(i); return fields.find((f) => f.label === chunk.hint) }
    return undefined
  })
  // 2 往復目の候補: 1 往復目の確率上位の欄
  const candidatesOf = (i: number, f: Field): Field[] => {
    if (forced.has(i)) return [f]
    const probs = answers[`c${i}`]?.probabilities ?? {}
    const top = fields.filter((x) => (probs[x.id] ?? 0) >= cfg.topFieldMin).sort((a, b) => (probs[b.id] ?? 0) - (probs[a.id] ?? 0)).slice(0, cfg.topFields)
    const ranked = top.some((x) => x.id === f.id) ? [f, ...top.filter((x) => x.id !== f.id)] : [f, ...top.slice(0, cfg.topFields - 1)]
    // 候補の選択肢の合計が上限を超えないよう、確率の高い順に収まる分だけ入れる（1 往復目で選んだ欄は必ず入る）
    const out: Field[] = []
    let n = 0
    for (const x of ranked) if (n + choices(x) <= MAX_CHOICES) { out.push(x); n += choices(x) }
    return out
  }
  const optQ: Record<string, Question> = {}
  const candidates = new Map<number, Field[]>()
  chosen.forEach((f, i) => {
    if (!f) return
    const cs = candidatesOf(i, f)
    // 自由記述の欄を確信して選んだ chunk は 2 往復目に回さない（選択肢の大きな欄と並べると答えが薄まる）
    if (!f.options?.length && !unsure.has(i)) return
    candidates.set(i, cs)
    optQ[`c${i}_opt`] = optionQuestion(i, cs, cfg)
  })
  const optAnswers = Object.keys(optQ).length ? (await ask(state, optQ)).answers : {}
  // 2 往復目の答えで欄と選択肢を確定する。`<欄id>=<選択肢>` か欄 id
  const picked = new Map<number, { option?: string; confidence: number }>()
  candidates.forEach((cs, i) => {
    const opt = optAnswers[`c${i}_opt`]
    if (!opt || opt.choice === NONE || opt.confidence < cfg.optionThreshold) { chosen[i] = undefined; return }
    const f = cs.find((x) => opt.choice === optionKey(x) || opt.choice.startsWith(`${x.id}=`))
    if (!f) { chosen[i] = undefined; return }
    chosen[i] = f
    picked.set(i, { option: f.options?.length ? opt.choice.slice(f.id.length + 1) : undefined, confidence: opt.confidence })
  })
  const out: Placement[] = []
  const optConf = new Map<Placement, number>()
  const merged = new Map<Placement, number>()   // 連結した語数
  chunks.forEach((chunk, i) => {
    const field = chosen[i]
    if (!field) return
    const a0 = answers[`c${i}`]
    const viaLabel = labelOf.get(i - 1)
    // 欄名判定で選んだ場合はその判定の confidence、hint で選んだ場合はその欄に Jev が与えた確率を confidence として残す
    const a1 = viaLabel ? { ...a0, choice: field.id, confidence: answers[`c${i - 1}`].confidence } : a0.choice === field.id ? a0 : { ...a0, choice: field.id, confidence: a0.probabilities[field.id] ?? cfg.threshold }
    // 2 往復目で決まった自由記述の chunk はその confidence を残す（選択肢の欄は欄の confidence を残し、選択肢の confidence は optConf で比べる）
    const a = picked.has(i) && !field.options?.length ? { ...a1, confidence: picked.get(i)!.confidence } : a1
    // 自由記述欄の欄名の直後は、断片全体を値にする（先頭に残った助詞は落とす）
    const text = viaLabel && chunk.src && !field.options?.length && !effectiveType(field, cfg) ? chunk.src.replace(/^[はがで](?=.)/, '') : viaLabel ? chunk.text.replace(/^[はがで](?=.)/, '') : chunk.text
    let value: string
    if (field.options?.length) {
      const opt = picked.get(i)
      if (!opt?.option) return
      value = opt.option
      // 同じ選択肢欄に隣接 chunk が向いたら（「ほぼ」「新品」）、選択肢の confidence が高い方だけ残す
      const last = out[out.length - 1]
      if (last && last.fieldId === field.id) {
        if (opt.confidence > (optConf.get(last) ?? 0)) { out.pop(); optConf.delete(last) } else return
      }
      const p: Placement = { fieldId: field.id, value, chunk: chunk.text, confidence: a.confidence }
      out.push(p); optConf.set(p, opt.confidence)
      return
    } else {
      value = text   // 整形・検証は gate の coerce
    }
    const last = out[out.length - 1]
    // 「山田 太郎」のように STT が 1 つの値を空白で割ったとき、隣接 chunk が同じ text 欄なら連結する。
    // 数値・日付欄は連結しない（「町」「100」→「町 100」にすると数値にならない）
    if (last && last.fieldId === field.id && !field.options?.length && !effectiveType(field, cfg)) {
      const joined = chunk.glue ? `${last.chunk}${chunk.text}` : `${last.chunk} ${chunk.text}`
      const n = (merged.get(last) ?? 1) + 1
      merged.set(last, n)
      // 断片の全単語が同じ欄に向いたら、助詞込みの元の文をそのまま使う（「底面に傷あり」）。断片に欄名が入っていたら（hint）それと助詞を除く
      const whole = chunk.src && chunk.srcN === n ? stripLabel(chunk.src, chunk.hint) : joined
      last.value = whole
      last.chunk = whole
      last.confidence = Math.min(last.confidence, a.confidence)
      return
    }
    out.push({ fieldId: field.id, value, chunk: text, confidence: a.confidence })
  })
  return out
}
