# jev-speakfill × React（モデルモード）

DOM を走査せず、React の state に直接配置する例。フォーム定義（`Field[]`）が入力欄の一覧そのもので、`Engine` の `apply` / `restore` が `setState` を呼ぶ。

```
# 1) Jev キーを持つサーバを起動（リポジトリのルートで）
npm run dev                # :8787。/route と語彙設定（speakfill.config.json）

# 2) この例
cd examples/react-app
npm install                # npm に min-release-age を設定していて新版が入らないときは --min-release-age=0
npm run dev                # :5173。/route は 8787 に proxy
```

見どころは `src/useSpeakfill.ts`（フック）と `src/SpeakfillFab.tsx`（右下のフロート UI）。フォーム本体は jev-speakfill を知らず、音声入力は opt-in の後付け。`jev-speakfill/dom` は使っていない。ドメインの語彙（単位・数値扱いにする欄名・instructions）は `App.tsx` の `CONFIG` でサーバ設定に重ねて送る。
