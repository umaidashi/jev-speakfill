# jev-speakfill

話すだけで、画面に見えている日本語フォームの正しい欄に入力する Chrome 拡張。欄名を言う必要はない（言ってもいい）。
「赤、革、ルイヴィトン」→ 色=赤 / 素材=革 / ブランド=ルイヴィトン。音声認識が「川」と聞き取っても、選択肢に「革」があればそれが選ばれる。
ルーティングは [TypeSafe Jev](https://typesafe.ai)：候補の欄から**選ぶだけで、値は生成しない**。値は音声認識の文字列がそのまま入る。

## 使い方
1. `npm install && npm run build`
2. `chrome://extensions` → デベロッパーモード → `dist/` を読み込む
3. 拡張の「オプション」で TypeSafe API キーを保存（BYOK。`chrome.storage.local` のみ）
4. フォームのあるページで side panel を開き 🎤。値と値の間は読点程度の間を空けて話す

## 権限
- `host_permissions: <all_urls>` + `scripting`: どのページのフォームにも書けるようにするため。インストール時に「すべてのサイトのデータの読み取りと変更」の警告が出る
- `sidePanel`, `storage`: UI と API キー保存
- マイク: side panel からは許可ダイアログが出ないので、初回は自動で開く `grant.html` で一度許可する

## 挙動
- 音声認識の `network` エラーやマイク拒否では停止する（🎤 を押し直す）。無音による切断は自動再開
- Jev のエラー（キー未設定・429 など）は該当発話を「未配置」として残し、拡張は動き続ける。自動リトライはしない

## データの行き先（自己責任で使うこと）
- 音声: Chrome の Web Speech API → Google
- 欄のラベル・種別・選択肢と、発話テキスト: TypeSafe API
- ページ本文・URL は送らない。password / クレジットカード / ワンタイムコード欄は対象外
- ふりがな/フリガナ/カナ欄も対象外（音声認識が漢字化するため。業務版ではサーバ側で変換する想定）。メールアドレスも音声では崩れるので非推奨
- 何を送ったかは side panel の「Jev に送った内容」で見られる

## 処理の流れ（発話 1 回 = Web Speech の final 1 つ）

```
音声 ─Web Speech─▶ 文字列 ─①segment─▶ chunk[] ─②context─▶ chunk[] + 直接配置
                                                    ▼
                         ③route ─Jev 1往復目─▶ 欄 ─Jev 2往復目─▶ 選択肢
                                                    ▼
                          ④gate（桁数）─▶ ⑤DOM 書き込み ─▶ ログ / Undo
```

### コード（決定的）と Jev（判断）の分担

| 段階 | ファイル | やること | 誰が |
|---|---|---|---|
| 音声→文字 | Web Speech (side panel) | `ja-JP` の文字起こし。interim は表示のみ、final だけ次へ | Google |
| ① chunk 化 | `core/segment.ts` | 読点・空白・「ラベル語+は/が/で」で割る。空白区切りの数字は結合。「〜です」を落とす。先頭の欄名（「電話は」）を剥がして `hint` に | コード |
| ② 文脈 | `core/context.ts` `applyContext` | 欄名だけの chunk（「郵便番号」）→ 値にせず次の chunk の `hint` に。直前 5 秒以内に数字欄へ置いていて数字だけの chunk が来た → Jev を呼ばずその欄に連結。数字の先頭ハイフン除去 | コード |
| ③-1 欄の選択 | `core/jev.ts` `buildQuestions` → `core/route.ts` | chunk ごとに Choice「どの欄の値か」。criteria = 欄 ID + `none`。state = 欄一覧（label/kind/options）+ chunk + 入力済み値。`hint` があれば instructions に明示。同音異義の注意も書く | **Jev** |
| ③-2 選択肢 | `core/jev.ts` `optionQuestion` → `route.ts` | ③-1 で選ばれた欄が select/radio/checkbox のときだけ、Choice「どの選択肢か」（+ `none`）。川→革 はここで吸収される | **Jev** |
| ③-3 採否 | `core/route.ts` | `none` または confidence < 0.35 は捨てる。text 欄は chunk 文字列をそのまま値に。電話/郵便は `normalize` で桁整形。隣接 chunk が同じ text 欄なら連結（「山田 太郎」） | コード |
| ④ 形式ゲート | `core/context.ts` `gate` / `checkFormat` | 電話 10〜11 桁、郵便 7 桁。短い → 書かずに保留（続き待ち）。長い → 形式不正で捨てる | コード |
| ⑤ 書き込み | `ext/dom.ts` | 欄収集（label/aria/placeholder/name/隣接テキスト、password・cc・ふりがな除外、非表示除外、100 件上限）、native setter で書き込み、Undo | コード |
| 配線 | `ext/sidepanel.ts` / `ext/background.ts` | 上記を順に呼ぶ。API キー保持と HTTP は service worker | コード |

### Jev が決めているのは 2 つだけ
1. この chunk はどの欄か（または該当なし）
2. その欄の値だとしたら、どの選択肢か（または該当なし）

区切り方・欄名の扱い・番号の連結・桁数の妥当性・値の文字列そのもの・書き込みはすべてコード。Jev は候補から**選ぶだけで文字列を生成しない**。「川」→「革」は Jev が「革」を作ったのではなく、選択肢から選んだ結果。text 欄（ブランドなど）は文字起こし結果がそのまま入るので、そこでの誤変換はコードでも Jev でも直らない。

Jev に渡すのは欄の `id/label/kind/options`、chunk と `hint`、`filled`（入力済み値）だけ。ページ本文・URL・除外欄・音声は渡さない。

### 既知の弱点
- コード側: chunk の区切りは日本語ヒューリスティック。「赤革ルイヴィトン」（無区切り）や「東京都在住の女性です」（1 文）は割れない
- Jev 側: text 欄の値の妥当性は判断していない（雑談が備考に入る可能性。`none` を返すことが多いが保証はない）
- 境界: 「文字起こしが正しいか」は誰も見ていない。選択肢欄だけ Jev が読みで補正できる

### 具体的な入力と結果
`npm run eval` が `tests/fixtures/ja.json` の発話を実 API に流し、①〜④ の中間結果を [docs/eval/latest.md](docs/eval/latest.md) に書く（どの chunk が、どの欄に、どの confidence で、どの選択肢になったか）。ケースを足すときは fixture に `text` と `expect` を追加する。拡張の side panel でも「Jev に送った内容」で直近リクエストの state/questions を見られる。

## 構成
- `src/core/` — DOM も mic も知らない。`segment`（chunk 化）、`context`（発話をまたぐ文脈・桁数ゲート）、`route`（Jev で欄選択）。React / iOS へそのまま移植する部分
- `src/ext/` — MV3 ホスト（side panel / content script / service worker）

## 開発
`npm test` / `npm run typecheck` / `npm run eval`（`.env` の `TYPESAFE_API_KEY` で実 API に fixture を流し、`docs/eval/latest.md` に段階ごとの結果を書く。現在 21/22）
