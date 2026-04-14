# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MySubChs is a personal web app for organizing YouTube subscriptions into custom categories with new video/live stream tracking and Web Push notifications. Single-user, Docker-based, designed for future AWS migration and multi-platform support (Twitch, etc.).

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend**: Next.js API Routes, NextAuth.js (Google OAuth), Prisma (PostgreSQL 16), BullMQ (Redis 7)
- **Infrastructure**: Docker Compose (app, worker, db, redis), PWA via next-pwa

## Architecture

- **Next.js App** serves both UI and API routes. Auth via NextAuth with Google OAuth (`youtube.readonly` scope).
- **BullMQ Worker** runs as a separate container (same image, different entrypoint) for background polling, watch-later cleanup, and content cleanup jobs.
- **Platform Adapter Pattern**: Channel/content fetching is abstracted via `PlatformAdapter` interface (`src/lib/platforms/base.ts`) for future multi-platform support. `platform` field exists on both Channel and Content tables.
- **Polling flow**: `playlistItems.list` (1 unit/call) is the primary API. `search.list` (100 units) is never used. `videos.list` is called only for new content detection and LIVE/UPCOMING status checks. `channels.list` is called once per channel to cache `uploadsPlaylistId`.
- **Content model**: `type` (VIDEO/LIVE) is immutable; `status` (UPCOMING/LIVE/ARCHIVED/CANCELLED) is updated by polling. `contentAt` is a computed sort key derived from type/status-specific timestamps.
- **Watch Later**: Presence-based model. `removedVia IS NOT NULL` prevents auto re-addition by polling. Manual additions have no expiry.
- **Pagination**: Keyset pagination on `(contentAt, id)` with Base64-encoded cursor.

## Key Design Decisions

- YouTube API quota budget: ~102 units/poll cycle for 100 channels. Default polling interval is 30 minutes (safe at 49% of 10,000 daily quota). 5/10 min intervals require UI warning.
- Channel unsubscribe is soft-delete (`isActive=false`); YouTube subscription state is never modified (readonly scope).
- Category deletion sets channel's `categoryId` to NULL (uncategorized). Uncategorized channels are excluded from automatic polling.
- `NotificationSetting` is auto-created with defaults when a category is created. `UserSetting` is auto-created on first login.
- Manual polling has 5-minute cooldown per category (Redis TTL).
- Polling job deduplication via fixed `jobId` + Redis lock.

## Implementation Rules

### DB Migration
When providing instructions that include running `prisma migrate`, always remind the developer
to take a backup first using `docs/operations.md` procedures (`./scripts/backup.sh pre-migration`).

### External Dependency Values
- **Never hardcode external dependency values**: Values derived from third-party service specifications (API limits, rate limits, quotas, etc.) must not be hardcoded inline. Define them as named constants in a dedicated config file (e.g., `src/lib/config.ts`) so they can be updated in one place.
- Example: YouTube API daily quota (`10,000` units), warning threshold (`9,000` units) → define as `YOUTUBE_QUOTA_DAILY_LIMIT` and `YOUTUBE_QUOTA_WARNING_THRESHOLD` in config.

### Bash Commands
- **cdプレフィックス禁止**: `cd <project-dir> && <cmd>` のようにプロジェクトディレクトリへの移動を前置しないこと。作業ディレクトリは常にプロジェクトルートである。

### YouTube API Quota

YouTube Data API v3 provides 10,000 units/day free. This is a hard limit with no automatic reset until next day UTC. Exceeding it causes all API calls to fail for the rest of the day.

For endpoint costs and full quota reference, see [`ref/youtube-api.md`](ref/youtube-api.md).

#### Mandatory Rules for All Implementations
- **Never use `search.list`**: Cost is prohibitive (100 units). Use `playlistItems.list` instead.
- **Cache aggressively**: `uploadsPlaylistId` must be cached in DB after first fetch. Never re-fetch if cached.
- **No redundant calls**: Do not call the same endpoint for data already available in DB.
- **Batch requests where possible**: `videos.list` accepts up to 50 `id` parameters per call — always batch.
- **Minimize polling scope**: Poll only channels in active categories (uncategorized channels excluded).
- **No quota spend on read-only UI**: Fetching data for display must use DB, not YouTube API.

#### Before Implementing Any Feature That Calls YouTube API
1. Calculate the quota cost per call and per day.
2. Confirm the cost fits within the daily budget given the polling interval.
3. Document the cost in code comments near the API call site.

## Testing

### Testing Strategy

- **Test runner**: Vitest
- **Scope**: Unit tests for `src/lib/` pure functions and jobs logic; integration tests for `src/app/api/` route handlers (using Prisma mocks). UI component tests are out of scope for now.
- **Prisma mocking**: Use `vitest-mock-extended` (`mockDeep<PrismaClient>()`). Mock `src/lib/db.ts` via `vi.mock('@/lib/db')`.
- **Auth mocking**: Mock `next-auth`'s `getServerSession` via `vi.mock('next-auth')`.

### Test File Naming and Location

- Co-locate test files with source files.
- Naming: `{source-file-name}.test.ts`
- Examples:
  - `src/lib/config.ts` → `src/lib/config.test.ts`
  - `src/app/api/categories/route.ts` → `src/app/api/categories/route.test.ts`
  - `src/jobs/contentCleanup.ts` → `src/jobs/contentCleanup.test.ts`

### Shared Test Infrastructure

- `src/tests/setup.ts` — Global setup
- `src/tests/helpers/prisma-mock.ts` — `mockDeep<PrismaClient>()` factory
- `src/tests/helpers/request-helper.ts` — `NextRequest` builder for API route tests
- `src/tests/fixtures/` — Shared test data factories

### Test Commands

- Run: `npx vitest run`
- Watch: `npx vitest`
- Coverage: `npx vitest run --coverage`

### When to Write Tests

Required when implementing:
- Any business logic or calculation in `src/lib/`
- Core API route handlers (`categories`, `contents`, `watch-later`, `settings`)
- Date-based or conditional logic in `src/jobs/`

Exempt: Worker entry points, UI components, simple pass-through routes.

### API Route Test Requirements

Each API route file (`route.ts`) must have a corresponding `route.test.ts`. Route tests must cover at minimum:
- **認証エラー**: 未認証時に401が返ること
- **バリデーションエラー**: 不正な入力で適切なエラーが返ること
- **正常系**: 主要な成功パスの動作確認
- **404**: 存在しないリソースへのアクセス（該当する場合）

## Editor Conventions

- **Line endings**: All files use LF. Enforced via `.gitattributes` (`* text=auto eol=lf`) and `.editorconfig` (`end_of_line = lf`).
- **Editor config**: `indent_style = space`, `indent_size = 2`, `charset = utf-8`, `trim_trailing_whitespace = true`, `insert_final_newline = true`.

## Documentation

All specs are in Japanese. The `docs/` directory is the Single Source of Truth. When in doubt, consult in this order:

1. `docs/requirements.md` — Functional/non-functional requirements
2. `docs/architecture.md` — System architecture, tech stack, directory structure, platform adapter pattern, pagination design
3. `docs/database.md` — DB schema, Prisma models, design considerations
4. `docs/openapi.yaml` — REST API specification (OpenAPI 3.1)
5. `docs/ui/common.md` — Frontend common specs (error handling, optimistic updates)
6. `docs/ui/*.md` — UI specifications per screen

Other references:
- `docs/coding-patterns.md` - Established implementation patterns (API route structure, formatters, test setup, error handling)
- `docs/integrations/youtube-auth.md` - Google OAuth flow, channel sync, Worker token management
- `docs/integrations/youtube-polling.md` - BullMQ polling design, quota management, error handling
- `docs/infrastructure.md` - Docker Compose, environment variables, AWS migration
- `docs/operations.md` - DB backup and migration procedures
- `docs/error-handling.md` - API error response format, error codes, logging policy
- `ref/youtube-api.md` - YouTube Data API v3 quota/endpoint reference

## Development Workflow — AI-Driven Spec-Based Development

This project follows AI-driven spec-based development. Claude Code autonomously handles design and implementation; the developer makes requirements/spec decisions and approves designs.

### Role Division

- **Claude Code (AI)**: Implementation and technical design. Responsible for writing code, proposing architecture, and keeping specs actionable.
- **Developer**: Spec decisions and design approval. All requirements decisions and spec changes require developer confirmation.

### Spec Quality — Written for AI Implementation

The `docs/` specs must be written so that Claude Code can implement them without ambiguity. When reading specs:

- **If a spec is ambiguous or underspecified**: Do NOT guess or make assumptions. Ask the developer to clarify, then update the spec with the agreed answer before implementing.
- **If a spec is redundant or contradictory**: Flag it to the developer and propose a correction. Do not silently ignore it.
- Claude Code may propose improvements to spec clarity, but must get developer approval before modifying any `docs/` file.

### Implementation Flow

1. **Plan mode required**: Always enter plan mode (present implementation plan → get developer approval) before writing code for non-trivial tasks. Only trivial fixes (typos, formatting) are exempt.
2. **Always ask on spec ambiguity**: If you find ambiguity or contradiction in the specs, never guess — always ask the developer before proceeding.
3. **Never decide specs unilaterally**: Do not make requirements decisions on your own. When a spec gap is discovered mid-implementation, stop and ask the developer.
4. **Confirm before creating or modifying specs**: When creating a new `docs/` file or making non-trivial edits to existing ones, always confirm the intended direction with the developer first.
5. **Keep specs and code in sync**: When a spec change is decided during implementation, update the relevant `docs/` files in the same commit or PR as the code change. Never let specs and code diverge.

### PR Review Response Policy

When responding to PR review comments:

1. **Do not blindly accept suggestions**: Reviewer comments are input, not instructions. Evaluate each comment on its merits.
2. **Assess validity first**: For each comment, judge whether the concern is valid given the codebase context, specs, and design decisions.
3. **Determine your own fix approach**: Even if the reviewer proposes a specific fix, independently decide the best implementation approach. The reviewer's suggestion may be suboptimal, incomplete, or based on incomplete context.
4. **Communicate your reasoning**: If you disagree with a comment or choose a different approach than suggested, explain why before implementing.
5. **Flag spec conflicts**: If acting on a review comment would conflict with `docs/` specs or `CLAUDE.md` rules, flag it explicitly rather than silently choosing one over the other.

### Git Workflow

- **Feature branches**: Create a branch per feature, merge to main when complete.
- Branch naming: `feature/<feature-name>` (e.g., `feature/auth`, `feature/polling`)
- Commit messages should be written in Japanese.

## Language

- This project's documentation, commit messages, and UI are in Japanese. Code (variable names, comments in code) should be in English.
- Claude Code should always respond in Japanese.
