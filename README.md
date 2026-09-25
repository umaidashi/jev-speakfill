# jev-speakfill

話すだけで、画面に見えている日本語フォームの正しい欄に入力する。欄名を言う必要はない（言ってもいい）。
「赤、革、ルイヴィトン」→ 色=赤 / 素材=レザー / ブランド=Louis Vuitton。音声認識が「川」と聞き取っても、選択肢に「革」があればそれが選ばれる。

ルーティングは [TypeSafe Jev](https://typesafe.ai)：候補の欄・選択肢から**選ぶだけで、値は生成しない**。text 欄には音声認識の文字列がそのまま入り、選択肢欄は表記揺れ（ヴィトン → Louis Vuitton、ブラック → 黒、ほぼ新品 → A ランク）を Jev が吸収する。

ホストは 3 つ: Chrome 拡張（最初のホスト）、任意ページに後付けする web widget、Jev キーを持つサーバ。コア（`src/core/`）は DOM も mic も知らないので React / iOS にそのまま載る。

## 使い方

### Chrome 拡張
1. `npm install && npm run build`
2. `chrome://extensions` → デベロッパーモード → `dist/` を読み込む
3. 拡張の「オプション」で TypeSafe API キーを保存（BYOK、`chrome.storage.local` のみ）。**または**「ルーティングサーバ URL」に `http://localhost:8787` を入れてサーバ経由にする（キーはサーバ側、トレースがサーバのファイルに残る）
4. `examples/form.html`（ブランドバッグ商品登録のサンプル）を開き、side panel で 🎤。初回はマイク許可ページ `grant.html` が自動で開く
5. 話す。値と値の間は読点程度の間でよい。「ルイヴィトン ハンドバッグ ネバーフル レザー 赤 金具はゴールド 状態は B 箱あり 保存袋あり」のような一文でも入る

side panel 上部の `build 2026-09-25 09:06` が自分の build 時刻より古ければ、拡張が更新されていない（`chrome://extensions` で 🔄 → side panel を開き直す）。

### web app（サンプル）
```
npm run dev   # build → http://localhost:8787
```
右下の 🎤 フロートボタン。ページの DOM から欄を拾い、発話をサーバの `POST /route` に送り、返ってきた配置を書く。任意のページには `<script src="widget.js" data-endpoint="https://your-api/route"></script>` で後付け。

### 開発
| コマンド | 内容 |
|---|---|
| `npm test` | ユニットテスト（core / dom / server ハンドラ、117 本） |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | 拡張・widget・サーバを `dist/` に。`examples/form.html` も生成 |
| `npm run dev` | build + サーバ起動（`.env` の `TYPESAFE_API_KEY`） |
| `npm run eval` | `tests/fixtures/ja.json` の発話を実 API に流し、段階ごとの結果を `docs/eval/latest.md` に書く。現在 66/66 |
| `tail -f logs/traces.jsonl \| python3 scripts/trace-tail.py` | サーバ経由の発話を 1 行ずつリアルタイムに読む |

`.env` は `.env.example` をコピーして `TYPESAFE_API_KEY=` を埋める（eval とサーバ専用。拡張本体はオプション画面）。

## 語彙・ヒントの設定（`SpeakfillConfig`）

コアには日本語一般の最小限（助詞・丁寧語・否定・相対日付・色名・電話/郵便の桁数・閾値）だけを持ち、**ドメインの語彙はホストから注入する**（`src/core/config.ts`）。JSON で書ける。

| 項目 | 例 | 効き方 |
|---|---|---|
| `synonyms` | `[{"spoken":"名前","label":"氏名"}]` | 発話語 → 欄ラベルの hint |
| `numericLabels` | `["価格","重量","マチ"]` | `type` が無くても number 扱い（「100円」→ 100） |
| `unitByLabel` | `[{"labels":["価格"],"unit":"円"}]` | Jev の criteria に単位を添える |
| `units` | `["センチ","円","グラム"]` | 「幅50高さ60」の対分割で数値に含める単位 |
| `excludeLabels` | `["ふりがな","カナ"]` | 収集しない欄 |
| `continuationLabels` | `["電話","郵便"]` | 数字だけの続きを連結する欄 |
| `instructions` | `"中古ブランドバッグの買取フォーム。「ランク」は状態ランク"` | Jev の instructions 末尾に付く自由記述 |
| `sttNote` / `typeHints` / `threshold` / `continueMs` / `maxFields` / `particles` / `trailers` / `negations` / `colors` | | 既定値を上書き |

注入口:
- **サーバ**: `speakfill.config.json`（`SPEAKFILL_CONFIG` で別パス）。リクエストの `config` が上書き
- **拡張**: オプション画面の「語彙・ヒント設定」に JSON。「商品登録プリセットを入れる」ボタンで `src/core/presets.ts` の `JA_COMMERCE` が入る。サーバ経由のときはサーバ設定に重ねて送る
- **widget**: `<script src="widget.js" data-config='{...}'>` か `window.speakfillConfig`
- **コード**: `pipeline(input, ask)` の `input.config`、`new Engine(host, onEvent, now, config)`、`collectFields(doc, { excludeLabels, maxFields })`

`src/core/presets.ts` の `JA_COMMERCE` は商品登録・顧客情報向けの語彙（eval とサンプルが使う）。自分のドメインではこれをコピーして編集する。

## 処理の流れ（発話 1 回 = Web Speech の final 1 つ）

```
音声 ─Web Speech─▶ 文字列 ─①segment─▶ chunk[] ─②context─▶ chunk[] + 直接配置
                                                    ▼
                         ③route ─Jev 1往復目─▶ 欄 ─Jev 2往復目─▶ 選択肢
                                                    ▼
                          ④gate（型・桁数）─▶ ⑤DOM 書き込み ─▶ ログ / Undo
```

### コード（決定的）と Jev（判断）の分担

| 段階 | ファイル | やること | 誰が |
|---|---|---|---|
| 音声→文字 | `web/speech.ts` | Web Speech `ja-JP`。interim は表示のみ、final だけ次へ。マイク拒否・network では停止、無音切断は自動再開 | Google |
| ① chunk 化 | `core/segment.ts` | 読点・空白・「ラベル語+は/が/で」で割る（桁区切りカンマと空白区切りの数字は割らない）。さらに `Intl.Segmenter`（ICU、内蔵）で単語に割り、助詞・「です」を落とす（「赤革ルイヴィトン」→ 赤/革/ルイヴィトン）。割りすぎは戻す: カタカナ同士、ひらがな同士、漢字/ひらがなで終わる語+ひらがな（佐藤あかね、高知ゆうご）、程度副詞+語（ほぼ新品）、欄ラベル・選択肢の辞書に合う結合（保存\|袋、東京\|都）。否定・除外（「新品ではない」「赤以外」）は割らず丸ごと。欄名は `hint` に剥がす: 「電話は…」、「幅32センチ」（数字直前）、「ブランドコーチ」（先頭）、「ゴールド金具」（後置）、「仕入れ日は」（送り仮名違い・欄名+助詞のみ）。「語+数字」が 2 対以上続く「幅50高さ60町200」は対に割り、語が欄名でなければ発話語（町）をそのまま hint に | コード |
| ② 文脈 | `core/context.ts` `applyContext` | 欄名だけの chunk（「郵便番号」）→ 値にせず次の chunk の `hint`（checkbox はラベル＝値なので除く）。直前 `continueMs`（5 秒）以内に `continuationLabels` の欄へ置いていて数字だけの chunk → Jev を呼ばずその欄に連結。数字の先頭ハイフン除去 | コード |
| ③-1 欄の選択 | `core/jev.ts` `buildQuestions` → `core/route.ts` | chunk ごとに Choice「どの欄の値か」。criteria = 欄 ID + `none`、各欄に type・単位（価格=円、重量=g/kg）・値の例（date なら「今日」「来年の8月6日」）を添える。state = 欄一覧 + その発話の全 chunk + 入力済み値 + 直前 3 発話（`recent`）。instructions: 欄名は発話されないことが多い／同音異義（川→革）は読みで判断／chunk が欄名そのもの（町=マチ）ならその欄を選べ／`hint` があれば強く考慮 | **Jev** |
| ③-2 選択肢 | `core/jev.ts` `optionQuestion` → `route.ts` | ③-1 で選ばれた欄が select/radio/checkbox のときだけ、Choice「どの選択肢か」（+ `none`）。表記揺れ・同音異義はここで吸収 | **Jev** |
| ③-3 採否 | `core/route.ts` | `none` または confidence < 0.5 は捨てる。隣接 chunk が同じ選択肢欄に向いたら選択肢の confidence が高い方だけ残す。text 欄は chunk 文字列をそのまま。隣接 chunk が同じ自由記述欄なら連結（`glue` なら空白なし: 山田+太郎。断片の全単語が同じ欄なら助詞込みの元の文: 底面に傷あり）。数値・日付欄は連結しない | コード |
| ④ 形式ゲート | `core/format.ts` `coerce`（`context.ts` の `gate` から） | HTML の `type` と `min/max/step/maxlength/pattern` に合わせて正規形に変換し検証。date（9月25日 / 明日 / 来年の8月6日 → `2027-08-06`）、time（午後3時半 → `15:30`）、datetime-local、month（日まで言われたら年月だけ）、number/range（3,000円 → `3000`、15万8000円 → `158000`、500グラム → `500`）、email/url（形式のみ）、color（赤 → `#ff0000`）、tel/郵便（10–11 桁 / 7 桁。短い → 保留、長い → 形式不正）、text の pattern/maxlength。`type` が無くても `numericLabels` に合うラベルは number。数値・日付欄に数字を含まない値（「たかさ」「町」）は形式不正にせず次の値のヒントにし、同じ発話の直後の数字はその欄に直接入れる | コード |
| ⑤ 書き込み | `dom/index.ts` | 欄収集（label/aria/placeholder/name/隣接テキスト。type と制約属性も。password・cc・one-time-code・非表示・`excludeLabels` は除外、`maxFields` 上限、id は要素ごとに安定）、native setter で書き込み（React 対応）、Undo | コード |
| 配線 | `core/engine.ts` | 上記を順に呼び、filled / ctx / recent / Undo を持つ。final を直列処理。ホストは 4 関数を渡すだけ | コード |

### Jev が決めているのは 2 つだけ
1. この chunk はどの欄か（または該当なし）
2. その欄の値だとしたら、どの選択肢か（または該当なし）

区切り方・欄名の扱い・番号の連結・型と桁数の妥当性・値の文字列そのもの・書き込みはすべてコード。Jev は候補から**選ぶだけで文字列を生成しない**。

Jev に渡すのは欄の `id/label/kind/options/type`、chunk と `hint`、`filled`、`recent` だけ。ページ本文・URL・除外欄・音声は渡さない。

### 既知の弱点
- 単語分割は ICU 辞書依存。未知のブランド名や造語は割れ方が読めない（同スクリプト結合と辞書結合である程度戻す）
- text 欄の値の妥当性は Jev も見ていない（雑談が備考に入りうる。`none` を返すことが多いが保証はない）。「底面に傷あり」は 備考 とも 状態ランク D とも読める
- 「文字起こしが正しいか」は誰も見ていない。選択肢欄だけ Jev が読みで補正できる
- ふりがな欄は対象外（STT が漢字化する）。メールアドレスも音声では崩れる。英語の文は `ja-JP` では認識されない（単語はカタカナになる）

### トレース
発話 1 回ごとに、文字起こし → chunk → 文脈 → Jev の質問と答え（往復ごと、所要 ms）→ 採否 → 検証結果 を `Trace`（`core/pipeline.ts`）として残す。
- 拡張: side panel に文字起こし（変換前）と配置を別枠で表示。「直近の発話のトレース」でその場で見る。📥 で `.jsonl`（1 行 1 発話、`chrome.storage.local` に直近 500 件）
- web widget: `localStorage` + 📥
- サーバ: `logs/traces.jsonl` に追記。`scripts/trace-tail.py` で読む
- `npm run eval`: fixture の全ケースの段階トレースを `docs/eval/latest.md` に

## アーキテクチャ

```
core/engine.ts   状態機械（filled / ctx / recent / Undo）。ホストは 4 関数を DI する
                   host = { fields(), apply(p), restore(id, prev), route(input) }
core/pipeline.ts segment → context → route → gate。ブラウザでも Node でも同じ
```
| ホスト | fields / apply / restore | route |
|---|---|---|
| Chrome 拡張 (`src/ext/`) | content script（`src/dom/`）にメッセージ | ローカル `pipeline` + Jev（service worker、BYOK）／オプション設定でサーバの `/route` |
| web widget (`src/web/widget.ts`) | 同じ `src/dom/` を直接 | `fetch('/route')` |
| サーバ (`src/server/`) | — | `pipeline` + Jev（キーは `.env`）。CORS 付き、トレースを `logs/traces.jsonl` へ |
| React / iOS（今後） | アプリのフォーム state に直接（DOM を触らない） | `fetch('/route')` |

`route` の入出力は JSON（`RouteInput` / `RouteResult`）。`ctx`（欄名ヒントと直前の配置）と `recent` をクライアントが持ち回るのでサーバはステートレス。

### 構成
- `src/core/` — `config`（語彙・閾値）/ `presets` / `types` / `segment` / `context` / `format` / `normalize` / `jev` / `route` / `pipeline` / `engine`。DOM も mic も知らない
- `src/dom/` — 欄収集・書き込み・Undo（拡張と widget が共用）
- `src/web/` — Web Speech の包み、トレース保存、フロートボタン widget、サンプルページ
- `src/server/` — `POST /route` ハンドラ + http サーバ
- `src/ext/` — MV3（side panel / content script / service worker / options / grant）
- `tests/` — Vitest。`tests/fixtures/ja.json` は eval の発話と期待値
- `docs/` — 競合調査、設計 spec、実装 plan、eval 結果

## 権限とデータ（自己責任で使うこと）
- 拡張: `host_permissions: <all_urls>` + `scripting`（どのページのフォームにも書くため。「すべてのサイトのデータの読み取りと変更」の警告が出る）、`sidePanel`、`storage`
- 音声: Chrome の Web Speech API → Google
- 欄のラベル・種別・選択肢・型と、発話テキスト、直前 3 発話: TypeSafe API（BYOK なら直接、サーバ経由ならサーバから）
- ページ本文・URL は送らない。password / クレジットカード / ワンタイムコード / ふりがな欄は対象外
- Jev のエラー（キー未設定・429 など）は該当発話を「未配置」として残し、動き続ける。自動リトライはしない
