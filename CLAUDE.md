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

## Documentation

All specs are in Japanese. Key documents:
- `docs/requirements.md` - Functional/non-functional requirements
- `docs/architecture.md` - Technical design, polling flow, state machines, quota calculations
- `docs/database.md` - DB schema, Prisma models, design considerations
- `docs/openapi.yaml` - REST API specification (OpenAPI 3.1)
- `ref/youtube-api.md` - YouTube Data API v3 quota/endpoint reference

## Directory Structure (planned)

```
src/
  app/              # Next.js App Router (pages + API routes)
    (auth)/login/   # Login page
    (dashboard)/    # Main dashboard, channels, categories, settings
    api/            # REST API endpoints
  components/       # UI (shadcn/ui), layout, feature components
  lib/              # Auth, DB client, Redis client, platform adapters
  jobs/             # BullMQ job definitions (polling, watchLaterCleanup, contentCleanup)
  types/            # Shared TypeScript types
prisma/             # Prisma schema
```

## Development Workflow — AI-Driven Spec-Based Development

This project follows AI-driven spec-based development. Claude Code autonomously handles design and implementation; the developer makes requirements/spec decisions and approves designs.

### Implementation Flow

1. **Plan mode required**: Always enter plan mode (present implementation plan → get developer approval) before writing code for non-trivial tasks. Only trivial fixes (typos, formatting) are exempt.
2. **Always ask on spec ambiguity**: If you find ambiguity or contradiction in the specs, never guess — always ask the developer before proceeding.
3. **Keep specs and code in sync**: When a spec change is decided during implementation, update the relevant `docs/` files in the same commit or PR as the code change. Never let specs and code diverge.

### Spec Authority

The `docs/` directory is the Single Source of Truth. When in doubt, consult in this order:
1. `docs/requirements.md` — Functional and non-functional requirements
2. `docs/architecture.md` — Technical design, polling flow, state machines
3. `docs/database.md` — DB schema, Prisma models
4. `docs/openapi.yaml` — REST API specification

### Git Workflow

- **Feature branches**: Create a branch per feature, merge to main when complete.
- Branch naming: `feature/<feature-name>` (e.g., `feature/auth`, `feature/polling`)
- Commit messages should be written in Japanese.

## Language

- This project's documentation, commit messages, and UI are in Japanese. Code (variable names, comments in code) should be in English.
- Claude Code should always respond in Japanese.
