# eval 結果 (2026-09-25T07:57)

欄: 氏名 / 電話番号 / メールアドレス / 都道府県[東京都/大阪府/北海道/福岡県] / 性別[男性/女性] / 色[赤/青/黒/白] / 素材[革/布/金属] / ブランド

## ✅ 「赤、革、ルイヴィトン」

- ① segment → [{"text":"赤"},{"text":"革"},{"text":"ルイヴィトン"}]
- ② context → chunks [{"text":"赤"},{"text":"革"},{"text":"ルイヴィトン"}]
- ③ Jev 1 往復目 → c0→色 (1.00), c1→素材 (1.00), c2→ブランド (1.00)
- ③ Jev 2 往復目 → c0_color→赤 (1.00), c1_material→革 (1.00)
- ④ gate → apply 色=赤, 素材=革, ブランド=ルイヴィトン
- 期待 → 色=赤, 素材=革, ブランド=ルイヴィトン

## ✅ 「赤、川、ルイヴィトン」

- ① segment → [{"text":"赤"},{"text":"川"},{"text":"ルイヴィトン"}]
- ② context → chunks [{"text":"赤"},{"text":"川"},{"text":"ルイヴィトン"}]
- ③ Jev 1 往復目 → c0→色 (0.99), c1→素材 (0.85), c2→ブランド (0.99)
- ③ Jev 2 往復目 → c0_color→赤 (1.00), c1_material→革 (0.93)
- ④ gate → apply 色=赤, 素材=革, ブランド=ルイヴィトン
- 期待 → 色=赤, 素材=革, ブランド=ルイヴィトン

## ✅ 「青、皮、シャネル」

- ① segment → [{"text":"青"},{"text":"皮"},{"text":"シャネル"}]
- ② context → chunks [{"text":"青"},{"text":"皮"},{"text":"シャネル"}]
- ③ Jev 1 往復目 → c0→色 (0.99), c1→素材 (1.00), c2→ブランド (0.99)
- ③ Jev 2 往復目 → c0_color→青 (1.00), c1_material→革 (0.99)
- ④ gate → apply 色=青, 素材=革, ブランド=シャネル
- 期待 → 色=青, 素材=革, ブランド=シャネル

## ✅ 「黒、金属、エルメス」

- ① segment → [{"text":"黒"},{"text":"金属"},{"text":"エルメス"}]
- ② context → chunks [{"text":"黒"},{"text":"金属"},{"text":"エルメス"}]
- ③ Jev 1 往復目 → c0→色 (0.99), c1→素材 (0.99), c2→ブランド (1.00)
- ③ Jev 2 往復目 → c0_color→黒 (1.00), c1_material→金属 (0.99)
- ④ gate → apply 色=黒, 素材=金属, ブランド=エルメス
- 期待 → 色=黒, 素材=金属, ブランド=エルメス

## ✅ 「佐藤あかね」

- ① segment → [{"text":"佐藤あかね"}]
- ② context → chunks [{"text":"佐藤あかね"}]
- ③ Jev 1 往復目 → c0→氏名 (0.99)
- ④ gate → apply 氏名=佐藤あかね
- 期待 → 氏名=佐藤あかね

## ✅ 「電話は09012345678」

- ① segment → [{"text":"09012345678","hint":"電話番号"}]
- ② context → chunks [{"text":"09012345678","hint":"電話番号"}]
- ③ Jev 1 往復目 → c0→電話番号 (1.00)
- ④ gate → apply 電話番号=090-1234-5678
- 期待 → 電話番号=090-1234-5678

## ✅ 「電話は090 1234 5678」

- ① segment → [{"text":"090 1234 5678","hint":"電話番号"}]
- ② context → chunks [{"text":"090 1234 5678","hint":"電話番号"}]
- ③ Jev 1 往復目 → c0→電話番号 (1.00)
- ④ gate → apply 電話番号=090-1234-5678
- 期待 → 電話番号=090-1234-5678

## ✅ 「山田 太郎」

- ① segment → [{"text":"山田"},{"text":"太郎"}]
- ② context → chunks [{"text":"山田"},{"text":"太郎"}]
- ③ Jev 1 往復目 → c0→氏名 (0.93), c1→氏名 (0.97)
- ④ gate → apply 氏名=山田 太郎
- 期待 → 氏名=山田 太郎

## ✅ 「東京都在住の女性です」

- ① segment → [{"text":"東京"},{"text":"都","glue":true},{"text":"在住","glue":true},{"text":"女性","glue":true}]
- ② context → chunks [{"text":"東京"},{"text":"都","glue":true},{"text":"在住","glue":true},{"text":"女性","glue":true}]
- ③ Jev 1 往復目 → c0→都道府県 (0.98), c1→都道府県 (0.87), c2→none (0.45), c3→性別 (1.00)
- ③ Jev 2 往復目 → c0_pref→東京都 (0.88), c1_pref→東京都 (0.50), c3_sex→女性 (0.99)
- ④ gate → apply 都道府県=東京都, 性別=女性
- 期待 → 都道府県=東京都, 性別=女性

## ✅ 「メールはtaro@example.com」

- ① segment → [{"text":"taro@example.com","hint":"メールアドレス"}]
- ② context → chunks [{"text":"taro@example.com","hint":"メールアドレス"}]
- ③ Jev 1 往復目 → c0→メールアドレス (1.00)
- ④ gate → apply メールアドレス=taro@example.com
- 期待 → メールアドレス=taro@example.com

## ✅ 「えーっと、ちょっと待ってください」

- ① segment → [{"text":"えーっと"},{"text":"ちょっと"},{"text":"待って","glue":true},{"text":"ください","glue":true}]
- ② context → chunks [{"text":"えーっと"},{"text":"ちょっと"},{"text":"待って","glue":true},{"text":"ください","glue":true}]
- ③ Jev 1 往復目 → c0→none (0.99), c1→none (0.98), c2→none (0.98), c3→none (0.98)
- ④ gate → apply (なし)
- 期待 → (なし)

## ✅ 「大阪 男性 090 9876 5432」

- ① segment → [{"text":"大阪"},{"text":"男性"},{"text":"090 9876 5432"}]
- ② context → chunks [{"text":"大阪"},{"text":"男性"},{"text":"090 9876 5432"}]
- ③ Jev 1 往復目 → c0→都道府県 (0.99), c1→性別 (1.00), c2→電話番号 (0.99)
- ③ Jev 2 往復目 → c0_pref→大阪府 (0.98), c1_sex→男性 (1.00)
- ④ gate → apply 都道府県=大阪府, 性別=男性, 電話番号=090-9876-5432
- 期待 → 都道府県=大阪府, 性別=男性, 電話番号=090-9876-5432

## ✅ 「赤革ルイヴィトン」

- ① segment → [{"text":"赤"},{"text":"革","glue":true},{"text":"ルイヴィトン","glue":true}]
- ② context → chunks [{"text":"赤"},{"text":"革","glue":true},{"text":"ルイヴィトン","glue":true}]
- ③ Jev 1 往復目 → c0→色 (0.99), c1→素材 (0.99), c2→ブランド (0.99)
- ③ Jev 2 往復目 → c0_color→赤 (1.00), c1_material→革 (1.00)
- ④ gate → apply 色=赤, 素材=革, ブランド=ルイヴィトン
- 期待 → 色=赤, 素材=革, ブランド=ルイヴィトン

## ✅ 「黒金属エルメス中古」

- ① segment → [{"text":"黒"},{"text":"金属","glue":true},{"text":"エルメス","glue":true},{"text":"中古","glue":true}]
- ② context → chunks [{"text":"黒"},{"text":"金属","glue":true},{"text":"エルメス","glue":true},{"text":"中古","glue":true}]
- ③ Jev 1 往復目 → c0→色 (1.00), c1→素材 (0.99), c2→ブランド (0.99), c3→none (0.88)
- ③ Jev 2 往復目 → c0_color→黒 (1.00), c1_material→金属 (0.99)
- ④ gate → apply 色=黒, 素材=金属, ブランド=エルメス
- 期待 → 色=黒, 素材=金属, ブランド=エルメス

## ✅ 「青い皮のシャネルのバッグ」

- ① segment → [{"text":"青い"},{"text":"皮","glue":true},{"text":"シャネル","glue":true},{"text":"バッグ","glue":true}]
- ② context → chunks [{"text":"青い"},{"text":"皮","glue":true},{"text":"シャネル","glue":true},{"text":"バッグ","glue":true}]
- ③ Jev 1 往復目 → c0→色 (0.99), c1→素材 (0.99), c2→ブランド (0.99), c3→none (0.60)
- ③ Jev 2 往復目 → c0_color→青 (0.99), c1_material→革 (0.98)
- ④ gate → apply 色=青, 素材=革, ブランド=シャネル
- 期待 → 色=青, 素材=革, ブランド=シャネル

## ✅ 「大阪の男性で佐藤あかねです」

- ① segment → [{"text":"大阪"},{"text":"男性","glue":true},{"text":"佐藤あかね","glue":true}]
- ② context → chunks [{"text":"大阪"},{"text":"男性","glue":true},{"text":"佐藤あかね","glue":true}]
- ③ Jev 1 往復目 → c0→都道府県 (0.99), c1→性別 (0.99), c2→氏名 (0.99)
- ③ Jev 2 往復目 → c0_pref→大阪府 (0.98), c1_sex→男性 (1.00)
- ④ gate → apply 都道府県=大阪府, 性別=男性, 氏名=佐藤あかね
- 期待 → 都道府県=大阪府, 性別=男性, 氏名=佐藤あかね

**一致 34/34**
