# 設計

jev-speakfill が「発話」を「フォームの正しい欄への入力」に変える仕組み。何をコードが決め、何を Jev に任せているか。

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


## 設計判断の記録
- **Jev は選ぶだけ、生成しない**。値の文字列はつねに文字起こし由来（型変換を除く）。誤入力の原因が「認識」か「配置」かを切り分けられる
- **option 質問は 2 往復目に分離**。全欄分を投機的に同梱すると入力トークンが 欄数×chunk 数 で膨らむ（実測 1.4 倍）。往復の増加は ~150ms
- **1 往復目の閾値 0.5**。0.35 では「バッグ」→ 氏名 (0.45) のような迷いが通った
- **語彙はコアに固定しない**。`SpeakfillConfig` の DEFAULT は日本語一般の最小、ドメイン語彙はプリセット/設定で注入（`docs/usage.md`）
- **サーバはステートレス**。`ctx`（欄名ヒントと直前の配置）と `recent`（直前 3 発話）はクライアントが持ち回る
- 経緯と代替案は `spec/`（着手時の spec と plan、競合調査）。更新しない
