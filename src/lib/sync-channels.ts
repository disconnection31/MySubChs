import { prisma } from '@/lib/db'
import type { ChannelMeta } from '@/lib/platforms/base'
import { YouTubeAdapter } from '@/lib/platforms/youtube'

export type SyncResult = {
  added: number
  restored: number
  deactivated: number
  updated: number
}

/**
 * YouTube チャンネル同期処理。
 * youtube-auth.md §2 「チャンネル同期フロー」の実装。
 *
 * 1. subscriptions.list で現在の登録チャンネルを全件取得
 * 2. channels.list でメタデータ（名前・アイコン・uploadsPlaylistId）をバッチ取得
 * 3. DB と比較して新規追加/復元/無効化/メタデータ更新を行う
 *
 * Quota cost: subscriptions.list 1 unit × ページ数 + channels.list 1 unit × バッチ数
 * 例: 100チャンネル → subscriptions 2ページ(2 units) + channels 2バッチ(2 units) = 4 units
 */
export async function syncChannels(
  userId: string,
  accessToken: string,
  adapter: YouTubeAdapter = new YouTubeAdapter(),
): Promise<SyncResult> {
  // Step 1: YouTube から現在の登録チャンネル一覧を取得
  const subscribedChannels = await adapter.getSubscribedChannels(accessToken)
  const subscribedIds = new Set(subscribedChannels.map((ch) => ch.platformChannelId))

  // Step 2: channels.list でメタデータを取得（uploadsPlaylistId 含む）
  const channelMetas = await adapter.getChannelMetas(
    Array.from(subscribedIds),
    accessToken,
  )
  const metaMap = new Map<string, ChannelMeta>()
  for (const meta of channelMetas) {
    metaMap.set(meta.platformChannelId, meta)
  }

  // Step 3: DB の既存チャンネルを取得
  const existingChannels = await prisma.channel.findMany({
    where: {
      userId,
      platform: 'youtube',
    },
    select: {
      id: true,
      platformChannelId: true,
      name: true,
      iconUrl: true,
      uploadsPlaylistId: true,
      isActive: true,
    },
  })

  const existingMap = new Map(
    existingChannels.map((ch) => [ch.platformChannelId, ch]),
  )

  let added = 0
  let restored = 0
  let deactivated = 0
  let updated = 0

  // Step 4: DB に存在しないチャンネル → 新規登録
  const newChannels: Array<{
    userId: string
    platform: string
    platformChannelId: string
    name: string
    iconUrl: string | null
    uploadsPlaylistId: string | null
    isActive: boolean
  }> = []

  metaMap.forEach((meta, platformChannelId) => {
    if (!existingMap.has(platformChannelId)) {
      newChannels.push({
        userId,
        platform: 'youtube',
        platformChannelId,
        name: meta.name,
        iconUrl: meta.iconUrl,
        uploadsPlaylistId: meta.uploadsPlaylistId,
        isActive: true,
      })
    }
  })

  if (newChannels.length > 0) {
    const result = await prisma.channel.createMany({
      data: newChannels,
      skipDuplicates: true,
    })
    added = result.count
  }

  // Step 5-6: 既存チャンネルの更新処理
  for (const existing of existingChannels) {
    const isStillSubscribed = subscribedIds.has(existing.platformChannelId)
    const meta = metaMap.get(existing.platformChannelId)

    if (!existing.isActive && isStillSubscribed) {
      // Step 5a: isActive=false → YouTube でまだ登録中なら復元
      const updateData: Record<string, unknown> = { isActive: true }
      if (meta) {
        updateData.name = meta.name
        updateData.iconUrl = meta.iconUrl
        updateData.uploadsPlaylistId = meta.uploadsPlaylistId
      }
      await prisma.channel.update({
        where: { id: existing.id },
        data: updateData,
      })
      restored++
    } else if (existing.isActive && !isStillSubscribed) {
      // Step 5b: isActive=true → YouTube で登録解除済みなら無効化
      await prisma.channel.update({
        where: { id: existing.id },
        data: { isActive: false },
      })
      deactivated++
    } else if (existing.isActive && isStillSubscribed && meta) {
      // Step 6: メタデータ更新（名前・アイコン・uploadsPlaylistId）
      const needsUpdate =
        existing.name !== meta.name ||
        existing.iconUrl !== meta.iconUrl ||
        existing.uploadsPlaylistId !== meta.uploadsPlaylistId

      if (needsUpdate) {
        await prisma.channel.update({
          where: { id: existing.id },
          data: {
            name: meta.name,
            iconUrl: meta.iconUrl,
            uploadsPlaylistId: meta.uploadsPlaylistId,
          },
        })
        updated++
      }
    }
  }

  return { added, restored, deactivated, updated }
}
