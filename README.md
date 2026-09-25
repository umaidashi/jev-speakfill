# jev-speakfill

話すだけで、画面に見えている日本語フォームの正しい欄に入力する。欄名を言う必要はない（言ってもいい）。

```
「ルイヴィトン ハンドバッグ ネバーフル レザー 赤 金具はゴールド 状態は B 箱あり 保存袋あり」
 → ブランド=Louis Vuitton / カテゴリ=ハンドバッグ / モデル=ネバーフル / 素材=レザー / 色=赤
   / 金具の色=ゴールド / 状態ランク=B / 箱 ☑ / 保存袋 ☑
```

ルーティングは [TypeSafe Jev](https://typesafe.ai)。候補の欄・選択肢から**選ぶだけで、値は生成しない**。text 欄には音声認識の文字列がそのまま入り、選択肢欄の表記揺れ（ヴィトン → Louis Vuitton、川 → 革、ブラック → 黒、ほぼ新品 → A ランク）は Jev が吸収する。区切り方・欄名の扱い・数字の連結・型と桁数の検証・書き込みはすべてコード。

ホストは 3 つ。コア（`src/core/`）は DOM も mic も知らないので React / iOS にもそのまま載る。

| ホスト | 用途 | Jev キー |
|---|---|---|
| Chrome 拡張 (`src/ext/`) | 任意のページで試す最初のホスト | BYOK、またはサーバ経由 |
| web widget (`src/web/`) | 既存ページに `<script>` で後付け | サーバ |
| サーバ (`src/server/`) | `POST /route`。語彙設定とトレースログを持つ | `.env` |

## クイックスタート

```
npm install && npm run build
cp .env.example .env       # TYPESAFE_API_KEY=... （サーバ / eval 用）
npm run dev                # http://localhost:8787 で web サンプル
```
Chrome 拡張は `chrome://extensions` で `dist/` を読み込み、オプションで API キー（またはサーバ URL）を設定して、`examples/form.html` を開いて side panel の 🎤。

## ドキュメント
- [docs/usage.md](docs/usage.md) — 使い方（拡張 / web / サーバ）、語彙・ヒントの設定、自分のアプリへの組み込み、権限とデータ
- [docs/design.md](docs/design.md) — 設計。処理の流れ、コードと Jev の分担、アーキテクチャ、既知の弱点、トレース、設計判断
- [docs/eval/latest.md](docs/eval/latest.md) — 実 API での評価結果（発話 → 各段階 → 配置、現在 66/66）
- [spec/](spec/) — 開発の経緯（競合調査、着手時の spec と実装 plan）。更新しない

## 構成
- `src/core/` — `config`（語彙・閾値）/ `presets` / `segment`（chunk 化）/ `context`（発話をまたぐ文脈・検証ゲート）/ `format`（型ごとの正規化）/ `jev`（質問生成）/ `route`（採否）/ `pipeline`（全段階）/ `engine`（状態機械）
- `src/dom/` — 欄収集・書き込み・Undo（拡張と widget が共用）
- `src/web/` — Web Speech の包み、トレース保存、フロートボタン widget、サンプルページ
- `src/server/` — `POST /route` + 静的配信
- `src/ext/` — MV3（side panel / content script / service worker / options / grant）
- `tests/` — Vitest（117 本）。`tests/fixtures/ja.json` は eval の発話と期待値
- `scripts/` — `eval.ts`（実 API 評価）、`trace-tail.py`（トレースの整形）

## 開発
`npm test` / `npm run typecheck` / `npm run build` / `npm run dev` / `npm run eval`。作業ブランチは `feat/mvp`、区切りで `main` に fast-forward。
