# jev-speakfill

話すだけで、画面に見えている日本語フォームの正しい欄に入力する Chrome 拡張。欄名を言う必要はない（言ってもいい）。
「赤、革、ルイヴィトン」→ 色=赤 / 素材=革 / ブランド=ルイヴィトン。音声認識が「川」と聞き取っても、選択肢に「革」があればそれが選ばれる。
ルーティングは [TypeSafe Jev](https://typesafe.ai)：候補の欄から**選ぶだけで、値は生成しない**。値は音声認識の文字列がそのまま入る。

## 使い方
1. `npm install && npm run build`
2. `chrome://extensions` → デベロッパーモード → `dist/` を読み込む
3. 拡張の「オプション」で TypeSafe API キーを保存（BYOK。`chrome.storage.local` のみ）
4. フォームのあるページで side panel を開き 🎤。値と値の間は読点程度の間を空けて話す

## データの行き先（自己責任で使うこと）
- 音声: Chrome の Web Speech API → Google
- 欄のラベル・種別・選択肢と、発話テキスト: TypeSafe API
- ページ本文・URL は送らない。password / クレジットカード / ワンタイムコード欄は対象外
- 何を送ったかは side panel の「Jev に送った内容」で見られる

## 構成
- `src/core/` — DOM も mic も知らない。`segment`（chunk 化）と `route`（Jev で欄選択）。React / iOS へそのまま移植する部分
- `src/ext/` — MV3 ホスト（side panel / content script / service worker）

## 開発
`npm test` / `npm run typecheck` / `npm run eval`（`.env` の `TYPESAFE_API_KEY` で実 API に fixture を流し一致率を出す。現在 20/21）
