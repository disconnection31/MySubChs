---
name: dev-driver
description: 開発計画のタスクを自律的に実装する。「T07を実装して」「T01をやって」のようにタスクID（T01〜T28）を指定されたときに使用する。plan/development-plan.mdに基づき、Issue取得→仕様読み込み→実装→テスト→レビュー→PR作成までを一気通貫で自律実行する。タスク番号やIssue番号で開発タスクの実装を頼まれた場合は必ずこのスキルを使うこと。
---

# 開発タスク自律実行（オーケストレーター）

開発計画 (`plan/development-plan.md`) のタスクを自律的に実装するオーケストレーター。タスクID（T01〜T28）を受け取り、**仕様確認→実装→テスト→レビュー→コミット→PR作成**をノンストップで実行する。

**git add / commit / push / gh pr create はオーケストレーター自身が実行する。** サブエージェントには絶対に実行させないこと。

---

## タスク→Issue→ブランチ マッピング

| タスク | Issue | ブランチ名 |
|--------|-------|-----------|
| T01 | #69 | feature/t01-project-init |
| T02 | #70 | feature/t02-prisma-schema |
| T03 | #71 | feature/t03-nextauth |
| T04 | #72 | feature/t04-api-common |
| T05 | #73 | feature/t05-frontend-common |
| T06 | #74 | feature/t06-login-page |
| T07 | #75 | feature/t07-category-crud-api |
| T08 | #76 | feature/t08-category-settings-api |
| T09 | #77 | feature/t09-category-management-ui |
| T10 | #78 | feature/t10-category-settings-ui |
| T11 | #79 | feature/t11-channel-api |
| T12 | #80 | feature/t12-channel-management-ui |
| T13 | #81 | feature/t13-content-watchlater-api |
| T14 | #82 | feature/t14-dashboard-basic |
| T15 | #83 | feature/t15-dashboard-extended |
| T16 | #84 | feature/t16-settings-api |
| T17 | #85 | feature/t17-settings-ui |
| T18 | #86 | feature/t18-platform-adapter |
| T19 | #87 | feature/t19-channel-sync |
| T20 | #88 | feature/t20-worker-foundation |
| T21 | #89 | feature/t21-polling-job |
| T22 | #90 | feature/t22-polling-advanced |
| T23 | #91 | feature/t23-manual-polling |
| T24 | #92 | feature/t24-web-push |
| T25 | #93 | feature/t25-polling-notifications |
| T26 | #94 | feature/t26-watchlater-auto-cleanup |
| T27 | #95 | feature/t27-content-cleanup |
| T28 | #96 | feature/t28-first-login-flow |

---

## フェーズ0: 準備

1. ユーザーの入力からタスクID（T01〜T28）を抽出する
2. 上記マッピングからIssue番号とブランチ名を特定する
3. `gh issue view <番号>` でIssue内容を取得する
4. `git status` でワーキングツリーがクリーンか確認する
   - クリーンでない場合は**停止**してユーザーに対処を求める
5. `dev-main` ブランチに切り替えて最新化し（`git checkout dev-main && git pull`）、`git checkout -b <ブランチ名>` でブランチを作成する

---

## フェーズ1: 方針策定

Agent ツール（subagent_type: Plan）を起動し、以下の内容をプロンプトとして渡す。

- Issue番号とIssue本文（gh issue view で取得した全文）
- `docs/` 配下の関連仕様書を確認すること（requirements.md, architecture.md, database.md, openapi.yaml, ui/*.md 等）
- 関連する既存コードを読んで現状を把握すること
- Issueの要件を仕様書と照合し、実装に必要な変更範囲を特定すること
- 仕様が不明・曖昧な場合は推測せず「設計上の疑問点」として報告すること
- 返答形式: 対象ファイル一覧 / 変更概要 / 注意点・設計上の考慮事項 / 設計上の疑問点

### サブエージェントの返答の扱い

- **設計上の疑問点が「なし」** → そのままフェーズ2へ進む（ユーザー承認は不要）
- **設計上の疑問点がある場合** → 仕様変更フロー（後述）で判定する：
  - **レベルA**（AI自己判断可能） → オーケストレーターが判断してフェーズ2へ
  - **レベルB/C**（仕様修正が必要） → **停止**してユーザーに報告し、解決を待つ

---

## フェーズ2: 実装

`.claude/skills/resolving-issue/agents/implementer.md` を Read ツールで読み込む。
テンプレート変数を以下の値で展開し、Agent ツール（subagent_type: general-purpose）に渡す。

| 変数 | 値 |
|------|-----|
| `{{ISSUE_NUMBER}}` | Issue番号 |
| `{{ISSUE_BODY}}` | gh issue view で取得したIssue全文 |
| `{{BRANCH_NAME}}` | 作成したブランチ名 |
| `{{APPROVED_PLAN}}` | フェーズ1でサブエージェントが返した方針全文 |

サブエージェントから受け取る情報:
- 変更ファイル一覧
- 実装概要
- テスト結果
- 未解決の設計判断

**未解決の設計判断がある場合** → 仕様変更フローで判定（レベルB/Cなら停止）

---

## フェーズ3: レビュー & 修正（1ラウンド）

`.claude/skills/resolving-issue/agents/reviewer-fixer.md` を Read ツールで読み込む。
テンプレート変数を以下の値で展開し、Agent ツール（subagent_type: general-purpose）に渡す。

| 変数 | 値 |
|------|-----|
| `{{ISSUE_NUMBER}}` | Issue番号 |
| `{{ISSUE_BODY}}` | gh issue view で取得したIssue全文 |
| `{{CHANGED_FILES}}` | 実装サブエージェントが返した変更ファイル一覧 |
| `{{IMPLEMENTATION_SUMMARY}}` | 実装サブエージェントが返した実装概要 |

reviewer-fixer を1回起動する。

### 返答ステータスと処理

| ステータス | 対応 |
|-----------|------|
| `PASS` | → フェーズ4へ進む |
| `NEEDS_ESCALATION` | → 指摘内容をユーザーに提示し判断を仰ぐ |

---

## フェーズ4: コミット・プッシュ・PR作成

**オーケストレーター自身が以下を実行する:**

1. `git add <変更ファイル一覧>` — ファイルを個別に指定してステージング
2. `git diff --cached --stat` で差分を最終確認する
3. `git commit` — 日本語コミットメッセージ（例: `feat: カテゴリCRUD APIを実装 #75`）
4. `/simplify` スキルを実行し、コードの品質・効率を改善する。修正があればコミットに含める
5. `git push -u origin <ブランチ名>`
6. `gh pr create --base dev-main` — 以下を含むPR本文を作成:
   - `Closes #<番号>`（マージ時にIssueを自動クローズ）
   - 実装内容の要約
   - テスト結果のサマリー
7. `gh pr create` の出力からPR番号を抽出する（例: `https://github.com/.../pull/101` → `#101`）
8. `plan/development-plan.md` の § 2 マッピング表で該当タスク行を更新する:
   - `PR#` 列に抽出したPR番号を記入（例: `#101`）
   - Edit ツールで当該行を直接書き換える（sed 等は使わない）
9. `git add plan/development-plan.md`
10. `git commit -m "chore: T<XX>のPR<番号>をdevelopment-plan.mdに記録"`
11. `git push origin <ブランチ名>`
12. PR URLをユーザーに報告し、マージしてよいかユーザーに確認する
13. ユーザーの承認後、`gh pr merge <PR番号> --squash` で Squash and merge を実行する
14. `gh issue close <Issue番号>` で Issue をクローズする
15. マージ・クローズ完了をユーザーに報告して完了

---

## 仕様変更フロー

実装中に仕様の抜け・不明点を発見した場合の判断基準。

### レベルA: AI が自己判断してよい（停止不要）

- エラーメッセージの具体的な文言
- ログ出力のフォーマット詳細
- コンポーネントのスタイル微調整
- UI レスポンシブの細かいレイアウト調整
- 仕様に明示されていないデフォルト値の選定
- `docs/error-handling.md` に定義されていないエッジケースのエラー処理

### レベルB: 停止して報告 → 確認後に継続

- API のレスポンス形式やフィールド定義が不明確
- DB 操作のトランザクション境界が不明確
- UI の状態遷移に抜けがある
- 機能の挙動に複数の解釈が成り立つ

### レベルC: 停止して報告 → 解決まで継続しない

- 複数の `docs/` ファイル間で矛盾がある
- 要件定義とアーキテクチャ設計が相反する

---

## 重要ルール

- **`git add / commit / push / gh pr create` はオーケストレーター自身が行う**（サブエージェントに委ねない）
- サブエージェントへの指示には「**git add / commit / push は絶対に実行しないこと**」を明記すること
- `git add` は `git add -A` や `git add .` を使わず、ファイルを個別に指定する
- ブランチ名はマッピング表の通りに作成する（`feature/tXX-xxx`）
- コミットメッセージは日本語で記述する
- レベルA以外の仕様問題を発見した場合は、**必ず停止**してユーザーに報告する
