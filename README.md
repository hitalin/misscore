# misscore

Misskey 向けのモデレーション判定エンジン。
[xai-org/x-algorithm](https://github.com/xai-org/x-algorithm) の
Labeling Path → Visibility Filtering → Enforcement の構造を、
Misskey で観測できる信号（禁止語・センシティブ推定・通報・ロール等）に写したもの。

副作用を持たない純粋なライブラリ。Misskey API の呼び出しやラベルの永続化は
利用側（yamisskey 本体、Cloudflare Workers、bot など）が行う。

## x-algorithm との対応

| x-algorithm | misscore | 役割 |
|---|---|---|
| botmaker / scarecrow | `labelers/` | イベント（ノート投稿）からノートラベルを付ける |
| agatha | `credibility.ts` `smoothedRatio` | 受けた通報 / (通報 + 好意的反応) のベイズ平滑化比率 |
| user-cred-v2 | `credibility.ts` `pagerank` `massToScore` | フォローグラフの PageRank から信頼スコアを出す |
| safety-label-user-agg | `aggregate.ts` | 「直近 N 件中 M 件」の DNF 条件でノートラベル → ユーザーラベル |
| visibility-filtering | `visibility/` | 閲覧者 × ノートごとに allow / interstitial / drop を返す順序付きルール表 |
| abuse-enforcement-service | `enforcement.ts` | first-match ルールで処置を決め、dedup と日次上限をかける |
| （Misskey 固有） | `triage.ts` | 通報（AbuseUserReport）の優先度と accept / reject / review の推奨 |
| （Misskey 固有） | `misskey/adapter.ts` | misskey-js 形の API オブジェクトとの相互変換、処置 → admin API 呼び出し |

## 判定の流れ

```
ノート投稿 (SystemWebhook / streaming / バッチ)
   │
   ▼
labelers   禁止語・sensitiveWords・maybePorn/maybeSensitive・メンション数・
           悪性 URL・連投・コピペ  →  NoteLabel[]（TTL 付き）
   │
   ▼
aggregate  作者の直近ノートのラベルを数えて UserLabel を付与
           例: メディア付き直近 5 件中 3 件が nsfw_high_precision → 作者に 7 日間
   │
   ▼
enforcement  allowlist → 凍結済み → 高信頼はレビュー送り → ラベル別処置 → 既定 skip
             処置: labelUser / silence(ロール付与) / suspend / deleteNote /
                   markSensitive / requireReview
   │
   ▼
misskey/adapter.toApiCalls  →  admin/suspend-user, admin/roles/assign,
                               notes/delete, drive/files/update, admin/update-user-note
```

閲覧時は `visibility/` が別経路で動く。

```
evaluate(policy, { note, author, viewer, relationship, noteLabels, authorLabels })
  HOME_POLICY             フォロー中の相手（ホーム TL、ユーザーページ）
  RECOMMENDATIONS_POLICY  非フォロー相手からの流入（LTL / GTL / アンテナ / 検索）
                          → 上に加えて high-recall 系ラベルとサイレンス作者を drop
  MODERATOR_POLICY        何も落とさない
```

x-algorithm と同じく、最初に一致した drop で評価を終え、interstitial は最初の 1 件だけ残す。
drop ルールは interstitial ルールより前に並べる不変条件を `validatePolicy` が検査する。
Audience（`everyone` / `exceptAuthor` / `exceptAuthorAndFollowers`）で
「作者本人には見せる」「フォロワーには見せる」を表現する。

## 使い方

```ts
import {
  DEFAULT_LABELER_CONFIG, credibility, judgeNote,
  fromApiNote, fromApiUser, toApiCalls,
  evaluate, policyForTimeline, triage,
} from 'misscore'

// 1. 投稿を判定する
const note = fromApiNote(apiNote)
const author = fromApiUser(apiUser)
const now = new Date()
const cred = credibility(author, now, undefined) // PageRank があれば第 3 引数に渡す

const result = judgeNote({
  note, author, now, credibility: cred,
  config: { ...DEFAULT_LABELER_CONFIG, prohibitedWords: meta.prohibitedWords },
  history: recentNotesWithLabels,   // 作者の直近ノートと保存済みラベル
  userLabels: storedUserLabels,     // 作者の保存済みユーザーラベル
})
// result.noteLabels / result.userLabels を保存し、
if (result.decision.outcome.kind === 'act') {
  const calls = toApiCalls(author.id, result.decision.outcome.actions, now, {
    silenceRoleId: 'canPublicNote=false のロール id',
  })
  // calls を admin トークンで順に POST する
}

// 2. タイムラインで表示可否を決める
const verdict = evaluate(policyForTimeline('local', relationship.viewerFollowsAuthor), {
  note, author, viewer, relationship, noteLabels, authorLabels,
})

// 3. 通報を並べ替える
const t = triage({ report: fromApiReport(apiReport), reporter, target, now })
// t.priority で降順ソート、t.recommendation が 'review' のものを人が見る
```

`Enforcer` クラスを使うと、同一ユーザーへの同クラス以下の処置を一定時間重複させず、
24 時間あたりの処置数に上限をかけられる（abuse-enforcement-service の dedup と日次上限に相当）。

## 設計上の判断

- **ラベルは存在だけを見る。** x-algorithm と同じく、スコアや期限はラベル付与側の責務で、
  可視性フィルタと処置ルールは「そのラベルが有効か」だけを見る。
- **高信頼ユーザーは自動処置しない。** PageRank またはフォロワー数・年齢からの信頼スコアが
  高ければ `requireReview` に倒す。誤検知の被害が大きい層を守るための x-algorithm の慣行。
- **Misskey に無いものは作らない。** 通報 category、サイレンス API、ラベル保存先は Misskey に無い。
  サイレンスは `canPublicNote=false` のロール付与、ラベルはモデレーションノートへの追記で代用する。
- **キーワード判定は Misskey と同じ意味論。** `isKeyWordIncluded`（`/re/flags` か空白区切り AND）と
  `checkWordMute`（配列 AND か正規表現）をそのまま写している。

## 開発

```sh
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome
pnpm build       # dist/ に出力
```

## ライセンス

MIT
