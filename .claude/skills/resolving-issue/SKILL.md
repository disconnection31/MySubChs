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

## フェーズ1: 方針策定

`.claude/skills/resolving-issue/agents/planner.md` を Read ツールで読み込む。
テンプレート変数を以下の値で展開し、Agent ツール（subagent_type: Plan）に渡す。

| 変数 | 値 |
|------|-----|
| `{{ISSUE_NUMBER}}` | Issue番号 |
| `{{ISSUE_BODY}}` | gh issue view で取得したIssue全文 |

**サブエージェントから受け取る情報（返答に含めるよう指示）:**
- 対象ファイル一覧
- 変更概要
- 注意点・設計上の考慮事項

**ユーザー確認（必須）:** 方針をユーザーに提示し、承認を得る。**承認なしにフェーズ2へ進まない。**
承認された方針を `{{APPROVED_PLAN}}` として保持する。

---

## フェーズ2: 実装

`.claude/skills/resolving-issue/agents/implementer.md` を Read ツールで読み込む。
テンプレート変数を以下の値で展開し、Agent ツール（subagent_type: general-purpose）に渡す。

| 変数 | 値 |
|------|-----|
| `{{ISSUE_NUMBER}}` | Issue番号 |
| `{{ISSUE_BODY}}` | gh issue view で取得したIssue全文 |
| `{{BRANCH_NAME}}` | 作成したブランチ名 |
| `{{APPROVED_PLAN}}` | フェーズ1でユーザーが承認した実装方針 |

**サブエージェントから受け取る情報（返答に含めるよう指示）:**
- 変更ファイル一覧
- 実装概要
- テスト結果
- 未解決の設計判断（あれば）

未解決の設計判断がある場合は、フェーズ3に進む前にユーザーに確認を取る。

---

## フェーズ3: レビュー & 修正

`.claude/skills/resolving-issue/agents/reviewer-fixer.md` を Read ツールで読み込む。
テンプレート変数を以下の値で展開し、Agent ツール（subagent_type: general-purpose）に渡す。

| 変数 | 値 |
|------|-----|
| `{{ISSUE_NUMBER}}` | Issue番号 |
| `{{ISSUE_BODY}}` | gh issue view で取得したIssue全文 |
| `{{CHANGED_FILES}}` | 実装サブエージェントが返した変更ファイル一覧 |
| `{{IMPLEMENTATION_SUMMARY}}` | 実装サブエージェントが返した実装概要 |

### 返答ステータスと orchestrator の処理

| STATUS | 意味 | orchestratorの対応 |
|--------|------|--------------------|
| `PASS` | CRITICAL_ISSUES なし | → フェーズ4へ進む |
| `NEEDS_ESCALATION` | 修正後も CRITICAL_ISSUES が残る | → 指摘内容をユーザーに提示し判断を仰ぐ |

**NEEDS_ESCALATION 時のユーザー選択:**
- **「このまま進む」** → フェーズ4へ
- **「修正する」** → 手動対応後「対応した」と伝えてもらい、フェーズ3に戻る

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

PRがマージされる前にレビューコメントが来た場合、鵜呑みにせず以下の手順で対応を決定する:

1. **指摘の検証**: 指摘内容が実際のバグ・問題であるかをコード確認・再現等で検証する
2. **意図の把握**: 修正を加える前にレビュアーの意図を正確に理解する
3. **精査**:
   - 指摘内容が技術的に正確か（仕様・ライブラリの挙動・ベストプラクティスと照合する）
   - 修正案が提示されていても、それが最善かを独自に判断する
   - 修正案がプロジェクトの設計方針（`docs/`、`CLAUDE.md`）と整合しているか
   - 修正によって別の問題が生じないか
4. **疑問・懸念がある場合**: そのまま修正せず、`gh api repos/{owner}/{repo}/issues/{number}/comments` でPRに返信コメントを投稿し、ユーザーに判断を仰ぐ
