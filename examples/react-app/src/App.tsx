import type { Field } from 'jev-speakfill'
import { useSpeakfill } from './useSpeakfill'
import { SpeakfillFab } from './SpeakfillFab'

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
    <main style={{ font: '14px system-ui', maxWidth: 560, margin: '24px auto' }}>
      <h1 style={{ fontSize: 18 }}>商品登録</h1>
      <p style={{ color: '#666' }}>普通のフォーム。音声入力は右下の 🎤 から opt-in（フォーム側は jev-speakfill を知らない）。</p>
      <form style={{ display: 'grid', gap: 6 }} onSubmit={(e) => e.preventDefault()}>
        {FIELDS.map((f) => (
          <label key={f.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', alignItems: 'center' }}>
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
      <details style={{ marginTop: 12 }}><summary style={{ color: '#888' }}>state</summary><pre style={{ background: '#f6f6f6', padding: 8, fontSize: 12 }}>{JSON.stringify(sf.values, null, 1)}</pre></details>
      <SpeakfillFab {...sf} />
    </main>
  )
}
