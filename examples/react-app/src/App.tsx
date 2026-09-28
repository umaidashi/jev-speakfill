import type { Field } from 'jev-speakfill'
import { useSpeakfill } from './useSpeakfill'

// フォーム定義がそのまま Field[]。id が state のキー。HTML は触らない
const FIELDS: Field[] = [
  { id: 'brand', label: 'ブランド', kind: 'select', options: ['Louis Vuitton', 'CHANEL', 'HERMÈS', 'GUCCI', 'PRADA', 'CELINE', 'Bottega Veneta', 'Saint Laurent', 'その他'] },
  { id: 'category', label: 'カテゴリ', kind: 'select', options: ['ハンドバッグ', 'ショルダーバッグ', 'トートバッグ', 'クラッチバッグ', 'リュック', '財布'] },
  { id: 'model', label: 'ライン・モデル名', kind: 'text' },
  { id: 'material', label: '素材', kind: 'select', options: ['レザー', 'キャンバス', 'ナイロン', 'デニム', 'PVC'] },
  { id: 'color', label: '色', kind: 'select', options: ['黒', '白', 'ベージュ', '茶', '赤', 'ピンク', '青', '緑', 'グレー', 'ゴールド', 'シルバー'] },
  { id: 'hardware', label: '金具の色', kind: 'select', options: ['ゴールド', 'シルバー', 'ピンクゴールド', 'ガンメタ'] },
  { id: 'cond', label: '状態ランク', kind: 'select', options: ['S（新品・未使用）', 'A（未使用に近い）', 'B（目立った傷や汚れなし）', 'C（やや傷や汚れあり）', 'D（傷や汚れあり）'] },
  { id: 'w', label: '幅 (cm)', kind: 'text', type: 'number', constraints: { min: '0', step: '0.5' } },
  { id: 'h', label: '高さ (cm)', kind: 'text', type: 'number', constraints: { min: '0', step: '0.5' } },
  { id: 'buy', label: '仕入日', kind: 'text', type: 'date' },
  { id: 'cost', label: '仕入れ値', kind: 'text', type: 'number', constraints: { min: '0', step: '100' } },
  { id: 'price', label: '販売価格', kind: 'text', type: 'number', constraints: { min: '0', step: '100' } },
  { id: 'note', label: '備考', kind: 'text' },
]

// ドメインの語彙はアプリ側で持つ（examples/web-app/speakfill.config.json と同じ内容の一部）
const CONFIG = {
  numericLabels: ['価格', '値', '幅', '高さ', 'マチ'],
  unitByLabel: [{ labels: ['価格', '値'], unit: '円' }, { labels: ['幅', '高さ', 'マチ'], unit: 'cm' }],
  units: ['センチ', '円'],
  instructions: '中古ブランドバッグの買取・出品フォーム。「ランク」は状態ランク（S〜D）。',
}

export function App() {
  const sf = useSpeakfill(FIELDS, '/route', CONFIG)
  const set = (id: string, v: string) => sf.setValues((s) => ({ ...s, [id]: v }))
  return (
    <main style={{ font: '14px system-ui', maxWidth: 720, margin: '24px auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <section>
        <h1 style={{ fontSize: 18 }}>商品登録（React state に直接配置）</h1>
        <p>
          <button onClick={sf.toggle} style={{ fontSize: 16 }}>{sf.listening ? '⏹ 停止' : '🎤 開始'}</button>{' '}
          <button onClick={sf.undo} disabled={!sf.canUndo}>↩ 取り消し</button>
          <span style={{ color: '#888', marginLeft: 8 }}>{sf.interim}</span>
        </p>
        <form style={{ display: 'grid', gap: 6 }} onSubmit={(e) => e.preventDefault()}>
          {FIELDS.map((f) => (
            <label key={f.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center' }}>
              <span>{f.label}</span>
              {f.kind === 'select' ? (
                <select value={sf.values[f.id] ?? ''} onChange={(e) => set(f.id, e.target.value)}>
                  <option value="">選択してください</option>
                  {f.options!.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type ?? 'text'} value={sf.values[f.id] ?? ''} onChange={(e) => set(f.id, e.target.value)} {...f.constraints} />
              )}
            </label>
          ))}
        </form>
        <pre style={{ background: '#f6f6f6', padding: 8, fontSize: 12 }}>{JSON.stringify(sf.values, null, 1)}</pre>
      </section>
      <section>
        <h2 style={{ fontSize: 14 }}>イベント</h2>
        <ul style={{ fontSize: 12, paddingLeft: 16 }}>
          {sf.events.map((ev, i) => <li key={i}>{describe(ev)}</li>)}
        </ul>
      </section>
    </main>
  )
}

function describe(ev: ReturnType<typeof useSpeakfill>['events'][number]): string {
  switch (ev.type) {
    case 'placed': return `${ev.label} ← ${ev.value} (${ev.confidence.toFixed(2)})`
    case 'pending': return `${ev.label}: ${ev.value}（続き待ち）`
    case 'rejected': return `${ev.label}: ${ev.value}（形式不正）`
    case 'unplaced': return `未配置: ${ev.text}`
    case 'waiting': return `「${ev.hint}」の値を待っています`
    case 'failed': return `書き込み失敗: ${ev.label}`
    case 'undone': return `取り消し: ${ev.label}`
    case 'error': return `エラー: ${ev.message}`
    case 'trace': return `trace: ${ev.trace.jev.length} 往復`
  }
}
