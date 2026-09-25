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
| ① chunk 化 | `core/segment.ts` | 読点・空白・「ラベル語+は/が/で」で割る。さらに `Intl.Segmenter`（ICU、内蔵）で単語に割り、助詞・「です」を落とす（「赤革ルイヴィトン」→ 赤/革/ルイヴィトン、「東京都在住の女性です」→ 東京/都/在住/女性）。割りすぎは戻す（カタカナ同士・ひらがな同士・漢字+ひらがな）。否定・除外（「新品ではない」「赤以外」）を含む chunk は割らず丸ごと Jev に渡す（割ると意味が反転する）。程度の副詞（「ほぼ新品」「やや傷あり」）は次の語にくっつける。欄ラベル・選択肢を辞書にして ICU の割りすぎを戻す（保存|袋 → 保存袋、東京|都 → 東京都）。ラベル語の直後に数字が続けば助詞なしでも hint（「幅32センチ」「仕入れ値12万円」）。同じ断片由来の語は `glue` 付き。空白区切りの数字は結合。先頭の欄名（「電話は」）を剥がして `hint` に | コード |
| ② 文脈 | `core/context.ts` `applyContext` | 欄名だけの chunk（「郵便番号」）→ 値にせず次の chunk の `hint` に。直前 5 秒以内に数字欄へ置いていて数字だけの chunk が来た → Jev を呼ばずその欄に連結。数字の先頭ハイフン除去 | コード |
| ③-1 欄の選択 | `core/jev.ts` `buildQuestions` → `core/route.ts` | chunk ごとに Choice「どの欄の値か」。criteria = 欄 ID + `none`。state = 欄一覧（label/kind/options）+ chunk + 入力済み値。`hint` があれば instructions に明示。同音異義の注意も書く | **Jev** |
| ③-2 選択肢 | `core/jev.ts` `optionQuestion` → `route.ts` | ③-1 で選ばれた欄が select/radio/checkbox のときだけ、Choice「どの選択肢か」（+ `none`）。川→革 はここで吸収される | **Jev** |
| ③-3 採否 | `core/route.ts` | `none` または confidence < 0.5 は捨てる。隣接 chunk が同じ選択肢欄に向いたら選択肢の confidence が高い方だけ残す。text 欄は chunk 文字列をそのまま値に。電話/郵便は `normalize` で桁整形。隣接 chunk が同じ text 欄なら連結（`glue` なら空白なし: 山田+太郎 → 山田太郎） | コード |
| ④ 形式ゲート | `core/format.ts` `coerce`（`gate` から呼ぶ） | HTML の `type` と `min/max/step/maxlength/pattern` に合わせて発話を正規形に変換し検証。date（9月25日 / 明日 → `2026-09-25`）、time（午後3時半 → `15:30`）、datetime-local、month、number/range（3,000円 → `3000`、15万8000円 → `158000`、1.5万 → `15000`）、email/url（形式のみ）、color（赤 → `#ff0000`）、tel/郵便（桁数。短い → 保留、長い → 形式不正）、text の pattern/maxlength。`type` が無くてもラベルが 価格/金額/重量/数量 なら number 扱い（「100円」→ `100`）。価格=円、重量=g/kg、数量=個 のような単位は 1 往復目の criteria にも書き、Jev が「100円」から価格欄を選べるようにする | コード |
| ⑤ 書き込み | `ext/dom.ts` | 欄収集（label/aria/placeholder/name/隣接テキスト、password・cc・ふりがな除外、非表示除外、100 件上限）、native setter で書き込み、Undo | コード |
| 配線 | `core/engine.ts` | 上記を順に呼び、filled / ctx / Undo を持つ。ホスト（拡張 / web / サーバ）は 4 関数を渡すだけ | コード |

### Jev が決めているのは 2 つだけ
1. この chunk はどの欄か（または該当なし）
2. その欄の値だとしたら、どの選択肢か（または該当なし）

区切り方・欄名の扱い・番号の連結・桁数の妥当性・値の文字列そのもの・書き込みはすべてコード。Jev は候補から**選ぶだけで文字列を生成しない**。「川」→「革」は Jev が「革」を作ったのではなく、選択肢から選んだ結果。text 欄（ブランドなど）は文字起こし結果がそのまま入るので、そこでの誤変換はコードでも Jev でも直らない。

Jev に渡すのは欄の `id/label/kind/options`、chunk と `hint`、`filled`（入力済み値）だけ。ページ本文・URL・除外欄・音声は渡さない。

### 既知の弱点
- コード側: 単語分割は ICU 辞書依存。未知のブランド名や造語は割れ方が読めない（同スクリプト結合である程度戻す）。1 語に複数値が入る「赤革」のような複合は ICU が割れば OK、割らなければ 1 chunk
- Jev 側: text 欄の値の妥当性は判断していない（雑談が備考に入る可能性。`none` を返すことが多いが保証はない）
- 境界: 「文字起こしが正しいか」は誰も見ていない。選択肢欄だけ Jev が読みで補正できる

### トレースログ
発話 1 回ごとに、文字起こし → chunk → 文脈 → Jev の質問と答え（往復ごと、所要 ms）→ 採否 → 検証結果 を `Trace` として残す（`core/pipeline.ts`）。
拡張は side panel の 📥 で `.jsonl`（1 行 1 発話）として保存（`chrome.storage.local` に直近 500 件）、web widget は `localStorage` + 📥。
side panel には文字起こしそのもの（変換前）も時刻付きで別枠に表示する。「ブラック → 黒」のような選択肢の表記揺れ補正は `jev[1].answers` に、形式不正は `gate.rejected` に残る。

### サンプルフォーム（ブランドバッグ商品登録）
`src/web/index.html`（`examples/form.html` は build で同内容を生成）。ブランド・カテゴリ・素材・色・状態は**正式名称の選択肢**にし、発話の表記揺れ（ルイヴィトン/ヴィトン → ルイ・ヴィトン、ボッテガ → ボッテガ・ヴェネタ、ブラック → 黒、ほぼ新品 → 未使用に近い、トゴ → レザー）は Jev の選択肢選びに任せる。付属品は checkbox（「箱と保存袋あり」で両方チェック）、寸法・価格は number、仕入日は date。

### 具体的な入力と結果
`npm run eval` が `tests/fixtures/ja.json` の発話を実 API に流し、①〜④ の中間結果を [docs/eval/latest.md](docs/eval/latest.md) に書く（どの chunk が、どの欄に、どの confidence で、どの選択肢になったか）。ケースを足すときは fixture に `text` と `expect` を追加する。拡張の side panel でも「Jev に送った内容」で直近リクエストの state/questions を見られる。

## web app への埋め込み（サンプル）

```
npm run dev   # build → http://localhost:8787（.env の TYPESAFE_API_KEY をサーバが使う）
```
右下の 🎤 フロートボタンで起動。ページの DOM から欄を拾い、発話をサーバの `POST /route` に送り、返ってきた配置を書く。
**Jev キーはサーバにしか無い**（拡張版の BYOK と違い、利用者にキーを持たせない）。

任意のページに後付けするには `<script src="widget.js" data-endpoint="https://your-api/route"></script>`。

### アーキテクチャ
```
core/engine.ts   状態機械（filled / ctx / Undo）。ホストは 4 関数を DI する
                   host = { fields(), apply(p), restore(id, prev), route(input) }
core/pipeline.ts segment → context → route → gate。ブラウザでも Node でも同じ
```
| ホスト | fields / apply / restore | route |
|---|---|---|
| Chrome 拡張 (`src/ext/`) | content script（`src/dom/`）にメッセージ | ローカル `pipeline` + Jev（service worker、BYOK） |
| web widget (`src/web/widget.ts`) | 同じ `src/dom/` を直接 | `fetch('/route')` |
| サーバ (`src/server/`) | — | `pipeline` + Jev（キーは `.env`） |
| React / iOS（今後） | アプリのフォーム state に直接（DOM を触らない） | `fetch('/route')` |

`route` の入出力は JSON（`RouteInput` / `RouteResult`）。`ctx`（欄名ヒントと直前の配置）をクライアントが持ち回るのでサーバはステートレス。

## 構成
- `src/core/` — DOM も mic も知らない。`segment`（chunk 化）、`context`（発話をまたぐ文脈・桁数ゲート）、`route`（Jev で欄選択）、`pipeline`（全段階）、`engine`（状態機械）。React / iOS へそのまま移植する部分
- `src/dom/` — 任意ページの欄収集・書き込み・Undo（拡張と web widget が共用）
- `src/web/` — Web Speech の包み、フロートボタン widget、サンプルページ
- `src/server/` — `POST /route` + 静的配信のサンプル backend
- `src/ext/` — MV3 ホスト（side panel / content script / service worker）

## 開発
`npm test` / `npm run typecheck` / `npm run dev`（web サンプル）/ `npm run eval`（`.env` の `TYPESAFE_API_KEY` で実 API に fixture を流し、`docs/eval/latest.md` に段階ごとの結果を書く。現在 38/38（ブランドバッグ商品登録フォーム想定））
