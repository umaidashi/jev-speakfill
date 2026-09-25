import { segment as segmentRaw } from '../../src/core/segment'
import { resolveConfig } from '../../src/core/config'
import { JA_COMMERCE } from '../../src/core/presets'
import type { Chunk } from '../../src/core/types'

// 語彙は商品登録プリセットで。src/srcN は route 用の付加情報なので text/hint/glue だけを見る
const CFG = resolveConfig(JA_COMMERCE)
const segment = (text: string, isFinal: boolean, f: Field[]): Chunk[] => segmentRaw(text, isFinal, f, CFG).map(({ src, srcN, ...c }) => c)
import type { Field } from '../../src/core/types'

const fields: Field[] = [
  { id: 'name', label: '氏名', kind: 'text' },
  { id: 'tel', label: '電話番号', kind: 'text' },
  { id: 'email', label: 'メールアドレス', kind: 'text' },
  { id: 'pref', label: '都道府県', kind: 'select', options: ['東京都', '大阪府'] },
]

test('interim は何も返さない', () => {
  expect(segment('山田太郎、電話は', false, fields)).toEqual([])
})

test('読点で割る（MVP 入力）', () => {
  expect(segment('赤、革、ルイヴィトン', true, fields)).toEqual([
    { text: '赤' }, { text: '革' }, { text: 'ルイヴィトン' },
  ])
})

test('空白のみでも割る（Review Focus 1）', () => {
  expect(segment('山田太郎 09012345678', true, fields)).toEqual([
    { text: '山田' }, { text: '太郎', glue: true }, { text: '09012345678' },
  ])
})

test('欄ラベル語+は を剥がして hint にする', () => {
  expect(segment('電話は09012345678、メールはa@b.jp', true, fields)).toEqual([
    { text: '09012345678', hint: '電話番号' },
    { text: 'a@b.jp', hint: 'メールアドレス' },
  ])
})

test('同義語表でも hint が付く（glue 側にも付く）', () => {
  expect(segment('名前は山田太郎', true, fields)).toEqual([{ text: '山田', hint: '氏名' }, { text: '太郎', hint: '氏名', glue: true }])
})

test('欄ラベル語の直前で 1 chunk 内の複数値を割る', () => {
  expect(segment('山田太郎で電話は09012345678です', true, fields)).toEqual([
    { text: '山田' }, { text: '太郎', glue: true }, { text: '09012345678', hint: '電話番号' },
  ])
})

test('無区切りの発話は単語に割る（Intl.Segmenter）。同じ chunk 由来は glue', () => {
  expect(segment('赤革ルイヴィトン', true, fields)).toEqual([
    { text: '赤' }, { text: '革', glue: true }, { text: 'ルイヴィトン', glue: true },
  ])
})

test('1 文の中の複数値: 助詞・です を落として単語にする', () => {
  expect(segment('東京都在住の女性です', true, fields)).toEqual([
    { text: '東京都' }, { text: '在住', glue: true }, { text: '女性', glue: true },   // 東京|都 は選択肢辞書で戻る
  ])
})

test('隣接するカタカナ単語は結合する（ブランド名が割れないように）', () => {
  expect(segment('黒金属エルメス中古', true, fields)).toEqual([
    { text: '黒' }, { text: '金属', glue: true }, { text: 'エルメス', glue: true }, { text: '中古', glue: true },
  ])
})

test('欄名だけの chunk と数字は単語に割らない', () => {
  expect(segment('氏名、電話番号、090 1234 5678、a@b.jp', true, fields)).toEqual([
    { text: '氏名' }, { text: '電話番号' }, { text: '090 1234 5678' }, { text: 'a@b.jp' },
  ])
})

test('空は捨てるが 1 文字（赤・革）は残す', () => {
  expect(segment('、。 、', true, fields)).toEqual([])
  expect(segment('赤', true, fields)).toEqual([{ text: '赤' }])
})

test('空白区切りの数字は 1 つの chunk に結合する（電話番号の読み上げ）', () => {
  expect(segment('大阪 男性 090 9876 5432', true, fields)).toEqual([
    { text: '大阪' }, { text: '男性' }, { text: '090 9876 5432' },
  ])
})

test('終助詞と衝突する名前を削らない（あかね・みさと・ちよ）', () => {
  expect(segment('あかね、みさと、ちよ', true, fields)).toEqual([{ text: 'あかね' }, { text: 'みさと' }, { text: 'ちよ' }])
  expect(segment('名前はみさと', true, fields)).toEqual([{ text: 'みさと', hint: '氏名' }])
  expect(segment('佐藤あかね', true, fields)).toEqual([{ text: '佐藤あかね' }])
  expect(segment('高知ゆうご', true, fields)).toEqual([{ text: '高知ゆうご' }])   // 高知ゆう|ご も戻す
})

test('ラベル語付きでも空白区切りの数字を 1 chunk に結合する', () => {
  expect(segment('電話は090 1234 5678', true, fields)).toEqual([{ text: '090 1234 5678', hint: '電話番号' }])
})

test('落とした助詞をまたいでは結合しない（シャネル の バッグ）', () => {
  expect(segment('青い皮のシャネルのバッグ', true, fields)).toEqual([
    { text: '青い' }, { text: '皮', glue: true }, { text: 'シャネル', glue: true }, { text: 'バッグ', glue: true },
  ])
})

test('漢字の直後のひらがな語は結合する（姓 + 名の読み）', () => {
  expect(segment('大阪の男性で佐藤あかねです', true, fields)).toEqual([
    { text: '大阪' }, { text: '男性', glue: true }, { text: '佐藤あかね', glue: true },
  ])
})

test('数字の桁区切りカンマでは割らない（12,500円）', () => {
  expect(segment('価格は12,500円、赤', true, [...fields, { id: 'price', label: '価格', kind: 'text', type: 'number' }])).toEqual([
    { text: '12500円', hint: '価格' }, { text: '赤' },
  ])
})

test('助詞だけの chunk は捨てる（STT が「発売 去年 の 7月」と空白で切ったとき）', () => {
  expect(segment('発売 去年 の 7月', true, fields)).toEqual([{ text: '発売' }, { text: '去年' }, { text: '7月' }])
})

test('否定・除外（〜ではない / じゃない / 以外 / じゃなくて）を含む chunk は割らずに丸ごと渡す', () => {
  const f2: Field[] = [...fields, { id: 'cond', label: '状態', kind: 'select', options: ['新品', '中古'] }]
  expect(segment('新品ではない', true, f2)).toEqual([{ text: '新品ではない' }])
  expect(segment('新品じゃない', true, f2)).toEqual([{ text: '新品じゃない' }])
  expect(segment('中古じゃなくて新品', true, f2)).toEqual([{ text: '中古じゃなくて新品' }])
  expect(segment('赤以外', true, f2)).toEqual([{ text: '赤以外' }])
  expect(segment('状態は新品ではない、赤', true, f2)).toEqual([{ text: '新品ではない', hint: '状態' }, { text: '赤' }])
})

describe('ブランドバッグ想定', () => {
  const bag: Field[] = [
    { id: 'cond', label: '状態', kind: 'select', options: ['新品・未使用', '未使用に近い', '傷や汚れあり'] },
    { id: 'box', label: '箱', kind: 'checkbox', options: ['箱'] },
    { id: 'bag', label: '保存袋', kind: 'checkbox', options: ['保存袋'] },
    { id: 'w', label: '幅 (cm)', kind: 'text', type: 'number' },
    { id: 'cost', label: '仕入れ値', kind: 'text', type: 'number' },
    { id: 'price', label: '販売価格', kind: 'text', type: 'number' },
    { id: 'color', label: '色', kind: 'select', options: ['赤', '黒'] },
    { id: 'material', label: '素材', kind: 'select', options: ['レザー'] },
  ]
  test('程度の副詞（ほぼ/やや）は次の語にくっつける', () => {
    expect(segment('ほぼ新品', true, bag)).toEqual([{ text: 'ほぼ新品' }])
    expect(segment('やや傷あり', true, bag)).toEqual([{ text: 'やや傷あり' }])
  })
  test('ラベル・選択肢の辞書で ICU の割りすぎを戻す（保存|袋 → 保存袋）。「赤革」は割ったまま', () => {
    expect(segment('箱と保存袋あり', true, bag)).toEqual([{ text: '箱' }, { text: '保存袋あり', glue: true }])
    expect(segment('赤革', true, bag)).toEqual([{ text: '赤' }, { text: '革', glue: true }])
  })
  test('送り仮名の違い（仕入れ日 vs 仕入日）を無視してラベルに合わせる。「〜は」で終わる語は欄名そのものに正規化', () => {
    const f2: Field[] = [...bag, { id: 'buy', label: '仕入日', kind: 'text', type: 'date' }]
    expect(segment('仕入れ日は昨日', true, f2)).toEqual([{ text: '昨日', hint: '仕入日' }])
    expect(segment('仕入れ日は 昨日', true, f2)).toEqual([{ text: '仕入日' }, { text: '昨日' }])
  })
  test('先頭がラベル語（2 文字以上、助詞なし）でも hint にする（ブランドコーチ → ブランド: コーチ）', () => {
    const f2: Field[] = [...bag, { id: 'brand', label: 'ブランド', kind: 'select', options: ['COACH'] }]
    expect(segment('ブランドコーチ', true, f2)).toEqual([{ text: 'コーチ', hint: 'ブランド' }])
    expect(segment('ブランド', true, f2)).toEqual([{ text: 'ブランド' }])
  })
  test('末尾がラベル語（2 文字以上）なら後置の欄名として hint にする（ゴールド金具 → 金具の色）', () => {
    const f2: Field[] = [...bag, { id: 'hardware', label: '金具の色', kind: 'select', options: ['ゴールド', 'シルバー'] }]
    expect(segment('ゴールド金具', true, f2)).toEqual([{ text: 'ゴールド', hint: '金具の色' }])
    expect(segment('ゴールド', true, f2)).toEqual([{ text: 'ゴールド' }])
  })
  test('「ラベル+数字」が連続する chunk は対に割る。STT の同音誤変換（町=マチ）は発話語をそのまま hint にして Jev に任せる', () => {
    const f2: Field[] = [...bag, { id: 'h', label: '高さ (cm)', kind: 'text', type: 'number' }, { id: 'd', label: 'マチ (cm)', kind: 'text', type: 'number' }]
    expect(segment('幅50 高さ60町200', true, f2)).toEqual([
      { text: '50', hint: '幅 (cm)' }, { text: '60', hint: '高さ (cm)' }, { text: '200', hint: '町' },
    ])
    expect(segment('幅50高さ60マチ20', true, f2)).toEqual([
      { text: '50', hint: '幅 (cm)' }, { text: '60', hint: '高さ (cm)' }, { text: '20', hint: 'マチ (cm)' },
    ])
  })
  test('ラベル語の直後に数字が続けば助詞なしでも hint にする（幅32センチ / 仕入れ値12万円）', () => {
    expect(segment('幅32センチ、高さ29、仕入れ値12万円、販売価格15万8000円', true, bag)).toEqual([
      { text: '32センチ', hint: '幅 (cm)' }, { text: '高さ29' }, { text: '12万円', hint: '仕入れ値' }, { text: '15万8000円', hint: '販売価格' },
    ])
  })
})

test('単語分割した chunk は元の断片（src）と語数（srcN）を持つ', () => {
  expect(segmentRaw('底面に傷あり', true, fields)).toEqual([
    { text: '底面', src: '底面に傷あり', srcN: 2 }, { text: '傷あり', glue: true, src: '底面に傷あり', srcN: 2 },
  ])
})

test('DEFAULT 設定には同義語が無い（ドメイン語彙はプリセット/設定で注入する）', () => {
  expect(segmentRaw('名前は山田太郎', true, fields).some((c) => c.hint)).toBe(false)   // 同義語なし → hint が付かない
  expect(segmentRaw('名前は山田太郎', true, fields, CFG).map((c) => c.hint)).toEqual(['氏名', '氏名'])   // プリセットあり → hint
})
