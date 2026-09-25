// @vitest-environment jsdom
import { collectFields, applyPlacement, restore } from '../../src/hosts/dom'

function page(html: string) {
  document.body.innerHTML = html
  return collectFields(document)
}

test('label for / aria-label / placeholder / name / 隣接テキストの順で label を作る', () => {
  const fields = page(`
    <label for="a">氏名</label><input id="a">
    <input id="b" aria-label="ニックネーム">
    <input id="c" placeholder="メール">
    <input id="d" name="tel">
    <div>住所</div><input id="e">
  `)
  expect(fields.map((f) => f.label)).toEqual(['氏名', 'ニックネーム', 'メール', 'tel', '住所'])
})

test('password / cc-* / one-time-code / hidden / disabled / readonly は除外', () => {
  const fields = page(`
    <input type="password"><input autocomplete="cc-number"><input autocomplete="one-time-code">
    <input type="hidden"><input disabled><input readonly><input id="ok">
  `)
  expect(fields).toHaveLength(1)
})

test('excludeLabels に合う欄は除外（例: ふりがな）。指定なしなら除外しない', () => {
  document.body.innerHTML = `
    <label for="a">氏名</label><input id="a">
    <label for="b">ふりがな</label><input id="b">
    <label for="c">フリガナ</label><input id="c">
    <input id="d" placeholder="氏名（カナ）">
  `
  expect(collectFields(document, { excludeLabels: ['ふりがな', 'フリガナ', 'カナ'] }).map((f) => f.label)).toEqual(['氏名'])
  expect(collectFields(document).map((f) => f.label)).toEqual(['氏名', 'ふりがな', 'フリガナ', '氏名（カナ）'])
})

test('select / radio / checkbox は kind と options を持つ', () => {
  const fields = page(`
    <label for="p">都道府県</label><select id="p"><option>東京都</option><option>大阪府</option></select>
    <fieldset><legend>性別</legend>
      <label><input type="radio" name="sex" value="m">男性</label>
      <label><input type="radio" name="sex" value="f">女性</label>
    </fieldset>
    <label><input type="checkbox" id="agree">同意する</label>
  `)
  expect(fields).toEqual([
    { id: expect.any(String), label: '都道府県', kind: 'select', options: ['東京都', '大阪府'] },
    { id: expect.any(String), label: '性別', kind: 'radio', options: ['男性', '女性'] },
    { id: expect.any(String), label: '同意する', kind: 'checkbox', options: ['同意する'] },
  ])
})

test('apply は native setter + input/change イベントで書き、prev を返す（Review Focus 3）', () => {
  const [f] = page(`<label for="a">氏名</label><input id="a" value="旧">`)
  const el = document.getElementById('a') as HTMLInputElement
  const events: string[] = []
  el.addEventListener('input', () => events.push('input'))
  el.addEventListener('change', () => events.push('change'))
  const r = applyPlacement({ fieldId: f.id, value: '山田太郎', chunk: '山田太郎', confidence: 1 })
  expect(r).toEqual({ fieldId: f.id, prev: '旧' })
  expect(el.value).toBe('山田太郎')
  expect(events).toEqual(['input', 'change'])
})

test('select は表示ラベル一致の option を選ぶ / radio は該当を checked / checkbox は checked', () => {
  const [sel, radio, cb] = page(`
    <label for="p">都道府県</label><select id="p"><option value="13">東京都</option><option value="27">大阪府</option></select>
    <fieldset><legend>性別</legend><label><input type="radio" name="sex" value="m">男性</label><label><input type="radio" name="sex" value="f">女性</label></fieldset>
    <label><input type="checkbox" id="agree">同意する</label>
  `)
  applyPlacement({ fieldId: sel.id, value: '大阪府', chunk: '', confidence: 1 })
  expect((document.getElementById('p') as HTMLSelectElement).value).toBe('27')
  applyPlacement({ fieldId: radio.id, value: '女性', chunk: '', confidence: 1 })
  expect((document.querySelector('input[value=f]') as HTMLInputElement).checked).toBe(true)
  applyPlacement({ fieldId: cb.id, value: '同意する', chunk: '', confidence: 1 })
  expect((document.getElementById('agree') as HTMLInputElement).checked).toBe(true)
})

test('restore で元に戻る', () => {
  const [f] = page(`<label for="a">氏名</label><input id="a" value="旧">`)
  applyPlacement({ fieldId: f.id, value: '新', chunk: '', confidence: 1 })
  restore(f.id, '旧')
  expect((document.getElementById('a') as HTMLInputElement).value).toBe('旧')
})

test('再収集しても同じ要素は同じ id で、前の apply を restore できる（Review Focus 7）', () => {
  const [f1] = page(`<label for="a">氏名</label><input id="a" value="旧">`)
  applyPlacement({ fieldId: f1.id, value: '新', chunk: '', confidence: 1 })
  const [f2] = collectFields(document)          // 2 発話目
  expect(f2.id).toBe(f1.id)
  restore(f1.id, '旧')
  expect((document.getElementById('a') as HTMLInputElement).value).toBe('旧')
})

test('100 件で打ち切る', () => {
  const fields = page(Array.from({ length: 120 }, (_, i) => `<input id="i${i}" placeholder="p${i}">`).join(''))
  expect(fields).toHaveLength(100)
})

test('祖先が display:none の欄は収集しない', () => {
  const fields = page(`<div style="display:none"><input id="h" placeholder="hidden"></div><input id="v" placeholder="visible">`)
  expect(fields.map((f) => f.label)).toEqual(['visible'])
})

test('checkbox/radio は prototype setter で書き、restore でも change を出す（React tracker 対策）', () => {
  const [radio, cb] = page(`
    <fieldset><legend>性別</legend><label><input type="radio" name="sex" value="m">男性</label><label><input type="radio" name="sex" value="f">女性</label></fieldset>
    <label><input type="checkbox" id="agree">同意する</label>
  `)
  const box = document.getElementById('agree') as HTMLInputElement
  const instanceSets: boolean[] = []
  Object.defineProperty(box, 'checked', { configurable: true, get: () => false, set: (v: boolean) => { instanceSets.push(v) } })
  applyPlacement({ fieldId: cb.id, value: '同意する', chunk: '', confidence: 1 })
  expect(instanceSets).toEqual([])   // インスタンス側 tracker を素通りして prototype に書く
  const protoGet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')!.get!
  expect(protoGet.call(box)).toBe(true)

  const f = document.querySelector('input[value=f]') as HTMLInputElement
  const events: string[] = []
  f.addEventListener('change', () => events.push('change'))
  applyPlacement({ fieldId: radio.id, value: '女性', chunk: '', confidence: 1 })
  restore(radio.id, '')
  expect(events).toEqual(['change', 'change'])
  expect(f.checked).toBe(false)
})

test('input の type と制約属性（min/max/step/maxlength/pattern）を Field に載せる', () => {
  const [d, n, t] = page(`
    <label for="d">購入日</label><input id="d" type="date" min="2026-01-01">
    <label for="n">価格</label><input id="n" type="number" min="0" step="100" max="100000">
    <label for="t">コード</label><input id="t" maxlength="6" pattern="[A-Z]+\\d+">
  `)
  expect(d).toMatchObject({ kind: 'text', type: 'date', constraints: { min: '2026-01-01' } })
  expect(n).toMatchObject({ type: 'number', constraints: { min: '0', max: '100000', step: '100' } })
  expect(t).toMatchObject({ constraints: { maxLength: 6, pattern: '[A-Z]+\\d+' } })
  expect(t.type).toBeUndefined()   // 素の text は type を付けない
})
