/**
 * backfill-thumbnails.ts
 *
 * 既存コンテンツの thumbnailUrl を YouTube API から一括取得・保存するスクリプト。
 * thumbnailUrl が null の全コンテンツを対象に videos.list (バッチ50件) で処理する。
 *
 * 使い方:
 *   npx tsx scripts/backfill-thumbnails.ts
 *
 * 必要な環境変数:
 *   DATABASE_URL       — PostgreSQL 接続 URL
 *   YOUTUBE_API_KEY    — YouTube Data API キー（サービスアカウント or OAuth不要の場合）
 *   または
 *   YOUTUBE_ACCESS_TOKEN — OAuth アクセストークン（動画のメタデータ取得に使用）
 *
 * Quota cost: 1 unit / 50件バッチ
 * ref: ref/youtube-api.md §4 videos.list
 */

import { PrismaClient } from '@prisma/client'

import { YOUTUBE_VIDEOS_MAX_RESULTS } from '../src/lib/config'

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

const prisma = new PrismaClient()

type ThumbnailResult = {
  platformContentId: string
  thumbnailUrl: string | null
}

/**
 * YouTube videos.list で指定 ID のサムネイル URL を取得する。
 * Quota cost: 1 unit/call (最大50件バッチ)
 */
async function fetchThumbnails(
  platformContentIds: string[],
  accessToken: string,
): Promise<ThumbnailResult[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    id: platformContentIds.join(','),
  })

  const response = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as {
    items?: Array<{
      id: string
      snippet?: {
        thumbnails?: {
          medium?: { url: string }
          default?: { url: string }
        }
      }
    }>
  }

  const resultMap = new Map<string, string | null>()
  for (const item of data.items ?? []) {
    const thumbnailUrl =
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ??
      null
    resultMap.set(item.id, thumbnailUrl)
  }

  // API レスポンスにない ID は null として扱う
  return platformContentIds.map((id) => ({
    platformContentId: id,
    thumbnailUrl: resultMap.get(id) ?? null,
  }))
}

async function main() {
  const accessToken = process.env.YOUTUBE_ACCESS_TOKEN
  if (!accessToken) {
    console.error('Error: YOUTUBE_ACCESS_TOKEN environment variable is required')
    process.exit(1)
  }

  console.log('=== サムネイル バックフィル開始 ===')

  // thumbnailUrl が null の YouTube コンテンツを全件取得
  const contents = await prisma.content.findMany({
    where: {
      platform: 'youtube',
      thumbnailUrl: null,
    },
    select: {
      id: true,
      platformContentId: true,
    },
  })

  console.log(`対象コンテンツ数: ${contents.length}`)

  if (contents.length === 0) {
    console.log('バックフィル対象なし。終了します。')
    return
  }

  let updated = 0
  let skipped = 0

  // 50件ずつバッチ処理
  for (let i = 0; i < contents.length; i += YOUTUBE_VIDEOS_MAX_RESULTS) {
    const batch = contents.slice(i, i + YOUTUBE_VIDEOS_MAX_RESULTS)
    const batchNum = Math.floor(i / YOUTUBE_VIDEOS_MAX_RESULTS) + 1
    const totalBatches = Math.ceil(contents.length / YOUTUBE_VIDEOS_MAX_RESULTS)

    console.log(`バッチ ${batchNum}/${totalBatches} 処理中... (${batch.length}件)`)

    try {
      const results = await fetchThumbnails(
        batch.map((c) => c.platformContentId),
        accessToken,
      )

      // DB を一括更新（thumbnailUrl が null でないもののみ）
      const updateOps = results
        .filter((r) => r.thumbnailUrl !== null)
        .map((r) => {
          const content = batch.find((c) => c.platformContentId === r.platformContentId)!
          return prisma.content.update({
            where: { id: content.id },
            data: { thumbnailUrl: r.thumbnailUrl },
          })
        })

      if (updateOps.length > 0) {
        await prisma.$transaction(updateOps)
        updated += updateOps.length
      }

      skipped += batch.length - updateOps.length
    } catch (err) {
      console.error(`バッチ ${batchNum} でエラーが発生しました:`, err)
      // エラーがあっても続行（最善努力）
    }
  }

  console.log(`\n=== バックフィル完了 ===`)
  console.log(`更新: ${updated}件`)
  console.log(`スキップ（サムネイル未取得）: ${skipped}件`)
}

main()
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
