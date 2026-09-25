import type { Field, Placement } from '../../core/types'

const registry = new Map<string, HTMLElement | HTMLInputElement[]>()  // radio は同名グループの配列
const ids = new WeakMap<HTMLElement, string>()                          // 要素ごとに安定した id
let seq = 0
const idFor = (el: HTMLElement) => {
  let id = ids.get(el)
  if (!id) { id = `f${seq++}`; ids.set(el, id) }
  return id
}

const isExcluded = (el: HTMLInputElement) => {
  const ac = el.getAttribute('autocomplete') ?? ''
  return el.type === 'hidden' || el.type === 'password' || el.type === 'submit' || el.type === 'button' || el.type === 'file' ||
    el.disabled || el.readOnly || ac.startsWith('cc-') || ac === 'one-time-code'
}

// jsdom に CSS.escape は無いので属性セレクタは使わない
function labelOf(el: HTMLElement): string {
  const doc = el.ownerDocument
  if (el.id) {
    const forLabel = Array.from(doc.querySelectorAll('label')).find((l) => l.htmlFor === el.id)
    if (forLabel?.textContent?.trim()) return forLabel.textContent.trim()
  }
  const aria = el.getAttribute('aria-label')
  if (aria) return aria.trim()
  const by = el.getAttribute('aria-labelledby')
  if (by) {
    const t = by.split(/\s+/).map((i) => doc.getElementById(i)?.textContent?.trim() ?? '').join(' ').trim()
    if (t) return t
  }
  const wrap = el.closest('label')
  if (wrap?.textContent?.trim()) return wrap.textContent.trim()
  const ph = el.getAttribute('placeholder')
  if (ph) return ph.trim()
  const name = el.getAttribute('name')
  if (name) return name
  const prev = el.previousElementSibling ?? el.parentElement?.previousElementSibling
  return prev?.textContent?.trim().slice(0, 40) ?? ''
}

function isVisible(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === 'function') return el.checkVisibility()
  // jsdom 用 fallback: 自身と祖先の display:none / hidden を見る
  const win = el.ownerDocument.defaultView
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    if (n.hidden) return false
    try { if (win?.getComputedStyle(n).display === 'none') return false } catch { /* layout なし */ }
  }
  return true
}

const TYPED = new Set(['date', 'time', 'datetime-local', 'month', 'week', 'number', 'range', 'email', 'url', 'color', 'tel'])

// HTML の type と制約属性を Field に載せる（core/format.ts が発話を正規形に変換・検証するため）
function typeAndConstraints(el: HTMLElement): Pick<Field, 'type' | 'constraints'> {
  const out: Pick<Field, 'type' | 'constraints'> = {}
  const type = el.getAttribute('type')?.toLowerCase()
  if (type && TYPED.has(type)) out.type = type
  const c: NonNullable<Field['constraints']> = {}
  for (const k of ['min', 'max', 'step', 'pattern'] as const) { const v = el.getAttribute(k); if (v !== null) c[k] = v }
  const ml = el.getAttribute('maxlength'); if (ml !== null && Number(ml) > 0) c.maxLength = Number(ml)
  if (Object.keys(c).length) out.constraints = c
  return out
}

export type CollectOptions = { excludeLabels?: string[]; maxFields?: number }   // core/config の同名項目を渡す

export function collectFields(root: Document, opts: CollectOptions = {}): Field[] {
  const MAX = opts.maxFields ?? 100
  const exclude = opts.excludeLabels ?? []
  registry.clear()
  const out: Field[] = []
  const seenRadio = new Set<string>()
  const add = (key: HTMLElement, target: HTMLElement | HTMLInputElement[], f: Omit<Field, 'id'>) => {
    if (out.length >= MAX) return
    const id = idFor(key)
    registry.set(id, target)
    out.push({ id, ...f })
  }
  const all = Array.from(root.querySelectorAll<HTMLElement>('input, textarea, select'))
  for (const el of all) {
    if (!isVisible(el)) continue
    if (el instanceof HTMLInputElement && isExcluded(el)) continue
    if (!(el instanceof HTMLSelectElement) && exclude.length && exclude.some((w) => labelOf(el).includes(w))) continue
    if (el instanceof HTMLSelectElement) {
      add(el, el, { label: labelOf(el), kind: 'select', options: Array.from(el.options).map((o) => o.text.trim()) })
    } else if (el instanceof HTMLInputElement && el.type === 'radio') {
      const key = el.name || el.id
      if (seenRadio.has(key)) continue
      seenRadio.add(key)
      const group = all.filter((x): x is HTMLInputElement => x instanceof HTMLInputElement && x.type === 'radio' && x.name === el.name)
      const legend = el.closest('fieldset')?.querySelector('legend')?.textContent?.trim()
      add(group[0], group, { label: legend ?? el.name, kind: 'radio', options: group.map(labelOf) })
    } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      const label = labelOf(el)
      add(el, el, { label, kind: 'checkbox', options: [label] })
    } else {
      add(el, el, { label: labelOf(el), kind: 'text', ...typeAndConstraints(el) })
    }
  }
  return out
}

function setNative(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set
  setter ? setter.call(el, value) : (el.value = value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

// React はインスタンスに checked の tracker を定義するので、prototype の setter で書かないと onChange が発火しない
const checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')!.set!
function setChecked(el: HTMLInputElement, checked: boolean) {
  checkedSetter.call(el, checked)
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

export function applyPlacement(p: Placement): { fieldId: string; prev: string } | null {
  const target = registry.get(p.fieldId)
  if (!target) return null
  if (Array.isArray(target)) {
    const prev = target.find((r) => r.checked)?.value ?? ''
    const hit = target.find((r) => labelOf(r) === p.value)
    if (!hit) return null
    setChecked(hit, true)
    return { fieldId: p.fieldId, prev }
  }
  if (target instanceof HTMLSelectElement) {
    const opt = Array.from(target.options).find((o) => o.text.trim() === p.value)
    if (!opt) return null
    const prev = target.value
    setNative(target, opt.value)
    return { fieldId: p.fieldId, prev }
  }
  if (target instanceof HTMLInputElement && target.type === 'checkbox') {
    const prev = String(target.checked)
    setChecked(target, true)
    return { fieldId: p.fieldId, prev }
  }
  const input = target as HTMLInputElement | HTMLTextAreaElement
  const prev = input.value
  setNative(input, p.value)
  return { fieldId: p.fieldId, prev }
}

export function restore(fieldId: string, prev: string): void {
  const target = registry.get(fieldId)
  if (!target) return
  if (Array.isArray(target)) {
    for (const r of target) if (r.checked !== (r.value === prev)) setChecked(r, r.value === prev)
    return
  }
  if (target instanceof HTMLInputElement && target.type === 'checkbox') return setChecked(target, prev === 'true')
  setNative(target as HTMLInputElement, prev)
}
