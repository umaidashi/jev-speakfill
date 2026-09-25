# 使い方

## Chrome 拡張
1. `npm install && npm run build`
2. `chrome://extensions` → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」で `dist/`
3. 拡張の「オプション」で次のどちらか
   - **BYOK**: TypeSafe API キーを保存（`chrome.storage.local` のみ。service worker からしか使わない）
   - **サーバ経由**: 「ルーティングサーバ URL」に `http://localhost:8787`（`npm run dev` で起動）。キーはサーバ側、トレースがサーバの `logs/traces.jsonl` に残る
4. 同じ画面の「語彙・ヒント設定」にドメインの語彙を JSON で入れる（任意。商品登録向けの例は `examples/web-app/speakfill.config.json`）
5. フォームのあるページ（例: `examples/form.html`）を開き、ツールバーのアイコン → side panel → 🎤 開始
   - 初回はマイク許可ページ `grant.html` が自動で開く（side panel からは許可ダイアログが出ないため）
6. 話す。値と値の間は読点程度の間でよい。「ルイヴィトン ハンドバッグ ネバーフル レザー 赤 金具はゴールド 状態は B 箱あり 保存袋あり」のような一文でも入る
7. 間違えたら ↩ 取り消し（直前の配置から順に戻す）

side panel の見方:
- 上部の `build 2026-09-25 09:06 / サーバ経由 …` — build 時刻が自分の build より古ければ拡張が更新されていない。`chrome://extensions` で 🔄 → side panel を開き直す
- 「文字起こし（そのまま）」— 変換前のテキスト。ここが間違っていれば音声認識の問題
- 「配置」— 欄 ← 値 (confidence)。「未配置」「桁が足りません（続き待ち）」「形式不正のため未入力」もここ
- 「直近の発話のトレース」— segment → context → Jev の質問と答え → 検証 の全段階
- 📥 ログを保存 — 直近 500 発話のトレースを `.jsonl` で

## web app（サンプル）
```
cp .env.example .env   # TYPESAFE_API_KEY= を埋める
npm run dev            # build → http://localhost:8787
```
右下の 🎤 フロートボタン。ページの DOM から欄を拾い、発話をサーバの `POST /route` に送り、返ってきた配置を書く。**Jev キーはサーバにしか無い**。

任意のページに後付けするには:
```html
<script src="widget.js" data-endpoint="https://your-api/route" data-config='{"instructions":"…"}'></script>
```
`data-config` の代わりに `window.speakfillConfig` でもよい。

### サーバ
- `POST /route` — body は `RouteInput`（`fields`, `text`, `filled`, `ctx`, `now`, `recent`, `config`）、返り値は `RouteResult`（`apply`, `pending`, `rejected`, `unplaced`, `hint`, `ctx`, `trace`）。CORS 付き
- `examples/web-app/speakfill.config.json` を語彙・ヒントの既定として読む（`SPEAKFILL_CONFIG` で別パス）。リクエストの `config` が上書き
- 発話ごとの `Trace` を `logs/traces.jsonl` に追記（`TRACE_LOG` で別パス）。`tail -f logs/traces.jsonl | python3 scripts/trace-tail.py` で読める
- `PORT`（既定 8787）

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
| `telLabels` / `zipLabels` | `["電話","携帯"]` / `["郵便","〒"]` | `type` が無い欄を tel / zip とみなすラベル語 |
| `timeZone` | `"Asia/Tokyo"` | 「今日」「明日」を解決するタイムゾーン |
| `relativeDays` / `relativeYears` | `{"きょう":0,"あした":1}` / `{"らいねん":1}` | 相対日付の語彙（かな表記・読み違いを足す） |
| `sttNote` / `typeHints` / `threshold` / `continueMs` / `maxFields` / `particles` / `trailers` / `negations` / `colors` / `noonWords` | | 既定値を上書き |

注入口:
- **サーバ**: 設定ファイル（サンプルは `examples/web-app/speakfill.config.json`）。リクエストの `config` が上書き
- **拡張**: オプション画面の「語彙・ヒント設定」。サーバ経由のときはサーバ設定に重ねて送る
- **widget**: `data-config` / `window.speakfillConfig`
- **コード**: `pipeline(input, ask)` の `input.config`、`new Engine(host, onEvent, now, config)`、`collectFields(doc, { excludeLabels, maxFields })`

`examples/web-app/speakfill.config.json` が商品登録・顧客情報向けの語彙（eval とサンプルが使う）。コアはドメイン語彙を一切持たないので、自分のドメインではこのファイルをコピーして編集し、サーバの設定ファイルか拡張のオプションに置く。

## サンプルフォーム（ブランドバッグ商品登録）
`examples/web-app/index.html`（`examples/form.html` は build で同内容を生成）。ブランド（正式英語名）・カテゴリ・素材・色・金具の色・状態ランク（S〜E）は select、付属品は checkbox、寸法・価格は number、仕入日は date。発話の表記揺れ（ヴィトン → Louis Vuitton、ブラック → 黒、ほぼ新品 → A）は Jev が選択肢から選ぶ。

## 自分のアプリに組み込む（React / iOS）
- **モデルモード**（推奨）: アプリのフォーム定義から `Field[]`（`id` = state のキー、`label`、`kind`、`options`、`type`、`constraints`）を作り、発話を `POST /route` に送り、`RouteResult.apply` を state に入れる。DOM を触らない
- **DOM モード**: 既存ページに `widget.js` を後付け
- iOS は `SFSpeechRecognizer` で文字起こし → `/route` を叩くだけ。コアを Swift に移植する必要はない
- 状態（`filled` / `ctx` / `recent` / Undo）の持ち方は `src/core/engine.ts` を参照。ホストは `fields / apply / restore / route` の 4 関数を渡す

## 開発
| コマンド | 内容 |
|---|---|
| `npm test` | ユニットテスト（core / dom / server ハンドラ） |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | 拡張・widget・サーバを `dist/` に。`examples/form.html` も生成 |
| `npm run dev` | build + サーバ起動 |
| `npm run eval` | `tests/fixtures/ja.json` の発話を実 API に流し、段階ごとの結果を `docs/eval/latest.md` に書く |

`.env` は `.env.example` をコピー（eval とサーバ専用）。

## 権限とデータ（自己責任で使うこと）
- 拡張: `host_permissions: <all_urls>` + `scripting`（どのページのフォームにも書くため。「すべてのサイトのデータの読み取りと変更」の警告が出る）、`sidePanel`、`storage`
- 音声: Chrome の Web Speech API → Google
- 欄のラベル・種別・選択肢・型と、発話テキスト、直前 3 発話: TypeSafe API（BYOK なら直接、サーバ経由ならサーバから）
- ページ本文・URL は送らない。password / クレジットカード / ワンタイムコード欄は対象外。`excludeLabels` で追加除外
- Jev のエラー（キー未設定・429 など）は該当発話を「未配置」として残し、動き続ける。自動リトライはしない
- 音声認識の `network` エラーやマイク拒否では停止（🎤 を押し直す）。無音による切断は自動再開
