---
name: resolving-issue
description: GitHubのIssueを対応する。「Issue #123を対応して」「このIssueを直して」と言われたときに使用する。
---

# GitHub Issue 対応（オーケストレーター）

このSkillはオーケストレーターとして動作する。実装・レビューはサブエージェントに委ねるが、**git add / commit / push / gh pr create はオーケストレーター自身が実行する**。

---

## フェーズ0: 準備

1. ユーザーの入力からIssue番号を抽出する
2. `gh issue view <番号>` でIssue内容を取得する
3. `git status` でワーキングツリーがクリーンか確認する
   - クリーンでない場合は**停止**してユーザーに対処を求める
4. Issue内容を読んで対応方針をユーザーに説明し、確認を取る
5. `git checkout -b fix/issue-<番号>` でブランチを作成する

---

## フェーズ1: 実装サブエージェントの起動

`.claude/skills/resolving-issue/agents/implementer.md` を Read ツールで読み込む。
テンプレート変数を以下の値で展開し、Agent ツール（subagent_type: general-purpose）に渡す。

| 変数 | 値 |
|------|-----|
| `{{ISSUE_NUMBER}}` | Issue番号 |
| `{{ISSUE_BODY}}` | gh issue view で取得したIssue全文 |
| `{{BRANCH_NAME}}` | 作成したブランチ名 |

**サブエージェントから受け取る情報（返答に含めるよう指示）:**
- 変更ファイル一覧
- 実装概要
- テスト結果
- 未解決の設計判断（あれば）

未解決の設計判断がある場合は、フェーズ2に進む前にユーザーに確認を取る。

---

## フェーズ2: レビューサブエージェントの起動

`.claude/skills/resolving-issue/agents/reviewer.md` を Read ツールで読み込む。
テンプレート変数を以下の値で展開し、Agent ツール（subagent_type: general-purpose）に渡す。

| 変数 | 値 |
|------|-----|
| `{{ISSUE_NUMBER}}` | Issue番号 |
| `{{ISSUE_BODY}}` | gh issue view で取得したIssue全文 |
| `{{CHANGED_FILES}}` | 実装サブエージェントが返した変更ファイル一覧 |
| `{{IMPLEMENTATION_SUMMARY}}` | 実装サブエージェントが返した実装概要 |

**サブエージェントから受け取る情報（返答に含めるよう指示）:**
- `STATUS: PASS` または `STATUS: NEEDS_FIX`
- CRITICAL_ISSUES（修正必須）
- WARNINGS（推奨修正）
- COMMENTS（その他コメント）

---

## フェーズ3: レビュー結果の処理

変数 `fix_attempt`（初期値: 0）でトラックする。

### PASS の場合
→ フェーズ4へ進む

### NEEDS_FIX（fix_attempt == 0）の場合
1. CRITICAL_ISSUES をオーケストレーターが表示する
2. implementer.md に CRITICAL_ISSUES を追記した形で修正サブエージェントを起動する
   - プロンプト末尾に「以下の CRITICAL_ISSUES のみを修正してください：<CRITICAL_ISSUESの内容>」を追加
3. `fix_attempt = 1` にして**フェーズ2に戻る**（再レビュー）

### NEEDS_FIX（fix_attempt >= 1）の場合
1. 指摘内容（CRITICAL_ISSUES・WARNINGS・COMMENTS）をユーザーに提示する
2. ユーザーの判断を仰ぐ:
   - **「このまま進む」** → フェーズ4へ
   - **「修正する」** → 手動対応後「対応した」と伝えてもらい、フェーズ2に戻る（fix_attempt はリセットしない）

---

## フェーズ4: コミット・プッシュ・PR作成

**オーケストレーター自身が以下を実行する:**

1. `git add <変更ファイル一覧>` — 変更ファイルを個別に指定してステージング
2. `git commit -m "<メッセージ>"` — Issue番号を含むコミットメッセージ（例: `fix: ログインエラーを修正 #123`）
3. `git push -u origin <ブランチ名>`
4. `gh pr create` — 以下を含むPR本文を作成:
   - `Closes #<番号>` （マージ時にIssueを自動クローズ）
   - 対応内容の要約
   - ユーザーと確認した対応方針
5. PR URLをユーザーに報告して完了

---

## 重要ルール

- **`git add / commit / push / gh pr create` はオーケストレーター自身が行う**（サブエージェントに委ねない）
- サブエージェントへの指示には「**git add / commit / push は絶対に実行しないこと**」を明記すること
- `git add` は `git add -A` や `git add .` を使わず、ファイルを個別に指定する
- `gh issue close` は使用しない（PR自動クローズに統一）
- ブランチ名はIssue番号を含める（例: `fix/issue-123`）

---

## レビューコメントへの対応方針（PR作成後）

PRがマージされる前にレビューコメントが来た場合、鵜呑みにせず以下の観点で精査してから対応を決定する:

- 指摘内容が技術的に正確か（仕様・ライブラリの挙動・ベストプラクティスと照合する）
- 修正案がプロジェクトの設計方針（`docs/`、`CLAUDE.md`）と整合しているか
- 修正によって別の問題が生じないか

**疑問がある場合**はそのまま修正せず、`gh api repos/{owner}/{repo}/issues/{number}/comments` でPRに返信コメントを投稿し、ユーザーに判断を仰ぐ。
