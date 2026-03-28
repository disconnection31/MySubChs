import { ContentStatus, ContentType, PrismaClient, WatchLaterSource } from '@prisma/client'

const prisma = new PrismaClient()

// ---------------------------------------------------------------------------
// Fixed IDs (UUIDv4 format, deterministic for idempotent upserts)
// ---------------------------------------------------------------------------

const DEV_USER_ID = '00000000-0000-4000-a000-000000000001'
const DEV_ACCOUNT_ID = '00000000-0000-4000-a000-000000000002'

// Category IDs
const CAT_GAME_ID = '10000000-0000-4000-a000-000000000001'
const CAT_MUSIC_ID = '10000000-0000-4000-a000-000000000002'
const CAT_TECH_ID = '10000000-0000-4000-a000-000000000003'
const CAT_COOKING_ID = '10000000-0000-4000-a000-000000000004'
const CAT_ENTERTAINMENT_ID = '10000000-0000-4000-a000-000000000005'

// NotificationSetting IDs
const NS_GAME_ID = '20000000-0000-4000-a000-000000000001'
const NS_MUSIC_ID = '20000000-0000-4000-a000-000000000002'
const NS_TECH_ID = '20000000-0000-4000-a000-000000000003'
const NS_COOKING_ID = '20000000-0000-4000-a000-000000000004'
const NS_ENTERTAINMENT_ID = '20000000-0000-4000-a000-000000000005'

// UserSetting ID
const USER_SETTING_ID = '30000000-0000-4000-a000-000000000001'

// Channel IDs (CH01-CH22)
const CH = Array.from({ length: 22 }, (_, i) => {
  const num = String(i + 1).padStart(2, '0')
  return `40000000-0000-4000-a000-0000000000${num}`
})

// Content IDs (CT01-CT51)
const CT = Array.from({ length: 51 }, (_, i) => {
  const num = String(i + 1).padStart(2, '0')
  return `50000000-0000-4000-a000-0000000000${num}`
})

const PLACEHOLDER_CHANNEL_ICON = '/images/placeholder-channel.svg'
const PLACEHOLDER_AVATAR = '/images/placeholder-avatar.svg'
const YOUTUBE_URL = 'https://www.youtube.com/watch?v='

// Base date: 2026-03-15T00:00:00Z
function d(offsetHours: number): Date {
  return new Date(Date.UTC(2026, 2, 15, 0, 0, 0) + offsetHours * 3600_000)
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding database...')

  // 1. User
  await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    update: {},
    create: {
      id: DEV_USER_ID,
      name: 'Dev User',
      email: 'dev@example.com',
      image: PLACEHOLDER_AVATAR,
    },
  })
  console.log('  User created')

  // 2. Account (dummy Google account)
  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: 'google',
        providerAccountId: 'dev-google-id-001',
      },
    },
    update: {},
    create: {
      id: DEV_ACCOUNT_ID,
      userId: DEV_USER_ID,
      type: 'oauth',
      provider: 'google',
      providerAccountId: 'dev-google-id-001',
      access_token: 'dev-access-token',
      refresh_token: 'dev-refresh-token',
      expires_at: Math.floor(d(1).getTime() / 1000),
      token_type: 'Bearer',
      scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
    },
  })
  console.log('  Account created')

  // 3. UserSetting
  await prisma.userSetting.upsert({
    where: { userId: DEV_USER_ID },
    update: {},
    create: {
      id: USER_SETTING_ID,
      userId: DEV_USER_ID,
      pollingIntervalMinutes: 30,
      contentRetentionDays: 60,
    },
  })
  console.log('  UserSetting created')

  // 4. Categories
  const categories = [
    { id: CAT_GAME_ID, name: 'ゲーム', sortOrder: 0 },
    { id: CAT_MUSIC_ID, name: '音楽', sortOrder: 1 },
    { id: CAT_TECH_ID, name: '技術', sortOrder: 2 },
    { id: CAT_COOKING_ID, name: '料理', sortOrder: 3 },
    { id: CAT_ENTERTAINMENT_ID, name: 'エンタメ', sortOrder: 4 },
  ]

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { userId_name: { userId: DEV_USER_ID, name: cat.name } },
      update: {},
      create: {
        id: cat.id,
        userId: DEV_USER_ID,
        name: cat.name,
        sortOrder: cat.sortOrder,
      },
    })
  }
  console.log('  Categories created (5)')

  // 5. NotificationSettings
  const notificationSettings = [
    {
      id: NS_GAME_ID,
      categoryId: CAT_GAME_ID,
      watchLaterDefault: true,
      autoExpireHours: 72,
      notifyOnUpcoming: false,
    },
    {
      id: NS_MUSIC_ID,
      categoryId: CAT_MUSIC_ID,
      watchLaterDefault: false,
      autoExpireHours: null,
      notifyOnUpcoming: true,
    },
    {
      id: NS_TECH_ID,
      categoryId: CAT_TECH_ID,
      watchLaterDefault: false,
      autoExpireHours: null,
      notifyOnUpcoming: false,
    },
    {
      id: NS_COOKING_ID,
      categoryId: CAT_COOKING_ID,
      watchLaterDefault: false,
      autoExpireHours: null,
      notifyOnUpcoming: false,
    },
    {
      id: NS_ENTERTAINMENT_ID,
      categoryId: CAT_ENTERTAINMENT_ID,
      watchLaterDefault: false,
      autoExpireHours: null,
      notifyOnUpcoming: false,
    },
  ]

  for (const ns of notificationSettings) {
    await prisma.notificationSetting.upsert({
      where: { categoryId: ns.categoryId },
      update: {},
      create: {
        id: ns.id,
        userId: DEV_USER_ID,
        categoryId: ns.categoryId,
        notifyOnNewVideo: true,
        notifyOnLiveStart: true,
        notifyOnUpcoming: ns.notifyOnUpcoming,
        watchLaterDefault: ns.watchLaterDefault,
        autoExpireHours: ns.autoExpireHours,
        autoPollingEnabled: true,
      },
    })
  }
  console.log('  NotificationSettings created (5)')

  // 6. Channels
  interface ChannelDef {
    id: string
    platformChannelId: string
    name: string
    categoryId: string | null
    uploadsPlaylistId: string
  }

  const channels: ChannelDef[] = [
    // ゲーム (4 channels)
    { id: CH[0], platformChannelId: 'UC_game01', name: 'ゲーム実況チャンネル', categoryId: CAT_GAME_ID, uploadsPlaylistId: 'UU_game01' },
    { id: CH[1], platformChannelId: 'UC_game02', name: 'レトロゲーム研究所', categoryId: CAT_GAME_ID, uploadsPlaylistId: 'UU_game02' },
    { id: CH[2], platformChannelId: 'UC_game03', name: 'FPS最前線', categoryId: CAT_GAME_ID, uploadsPlaylistId: 'UU_game03' },
    { id: CH[3], platformChannelId: 'UC_game04', name: 'インディーゲーム紹介', categoryId: CAT_GAME_ID, uploadsPlaylistId: 'UU_game04' },
    // 音楽 (4 channels)
    { id: CH[4], platformChannelId: 'UC_music01', name: 'DTMクリエイター', categoryId: CAT_MUSIC_ID, uploadsPlaylistId: 'UU_music01' },
    { id: CH[5], platformChannelId: 'UC_music02', name: 'ギター教室Online', categoryId: CAT_MUSIC_ID, uploadsPlaylistId: 'UU_music02' },
    { id: CH[6], platformChannelId: 'UC_music03', name: 'クラシック名曲集', categoryId: CAT_MUSIC_ID, uploadsPlaylistId: 'UU_music03' },
    { id: CH[7], platformChannelId: 'UC_music04', name: 'Vocaloid新曲まとめ', categoryId: CAT_MUSIC_ID, uploadsPlaylistId: 'UU_music04' },
    // 技術 (4 channels)
    { id: CH[8], platformChannelId: 'UC_tech01', name: 'Web開発チュートリアル', categoryId: CAT_TECH_ID, uploadsPlaylistId: 'UU_tech01' },
    { id: CH[9], platformChannelId: 'UC_tech02', name: 'AI最新ニュース', categoryId: CAT_TECH_ID, uploadsPlaylistId: 'UU_tech02' },
    { id: CH[10], platformChannelId: 'UC_tech03', name: 'Linux活用術', categoryId: CAT_TECH_ID, uploadsPlaylistId: 'UU_tech03' },
    { id: CH[11], platformChannelId: 'UC_tech04', name: 'セキュリティ講座', categoryId: CAT_TECH_ID, uploadsPlaylistId: 'UU_tech04' },
    // 料理 (3 channels)
    { id: CH[12], platformChannelId: 'UC_cook01', name: '時短レシピの達人', categoryId: CAT_COOKING_ID, uploadsPlaylistId: 'UU_cook01' },
    { id: CH[13], platformChannelId: 'UC_cook02', name: 'プロの和食', categoryId: CAT_COOKING_ID, uploadsPlaylistId: 'UU_cook02' },
    { id: CH[14], platformChannelId: 'UC_cook03', name: 'お菓子作りLab', categoryId: CAT_COOKING_ID, uploadsPlaylistId: 'UU_cook03' },
    // エンタメ (4 channels)
    { id: CH[15], platformChannelId: 'UC_ent01', name: 'お笑いハイライト', categoryId: CAT_ENTERTAINMENT_ID, uploadsPlaylistId: 'UU_ent01' },
    { id: CH[16], platformChannelId: 'UC_ent02', name: '映画レビュー館', categoryId: CAT_ENTERTAINMENT_ID, uploadsPlaylistId: 'UU_ent02' },
    { id: CH[17], platformChannelId: 'UC_ent03', name: 'アニメ考察ch', categoryId: CAT_ENTERTAINMENT_ID, uploadsPlaylistId: 'UU_ent03' },
    { id: CH[18], platformChannelId: 'UC_ent04', name: 'VTuber切り抜き', categoryId: CAT_ENTERTAINMENT_ID, uploadsPlaylistId: 'UU_ent04' },
    // 未分類 (3 channels)
    { id: CH[19], platformChannelId: 'UC_uncat01', name: '雑学チャンネル', categoryId: null, uploadsPlaylistId: 'UU_uncat01' },
    { id: CH[20], platformChannelId: 'UC_uncat02', name: '旅行Vlog', categoryId: null, uploadsPlaylistId: 'UU_uncat02' },
    { id: CH[21], platformChannelId: 'UC_uncat03', name: 'DIY工房', categoryId: null, uploadsPlaylistId: 'UU_uncat03' },
  ]

  for (const ch of channels) {
    await prisma.channel.upsert({
      where: {
        userId_platform_platformChannelId: {
          userId: DEV_USER_ID,
          platform: 'youtube',
          platformChannelId: ch.platformChannelId,
        },
      },
      update: {},
      create: {
        id: ch.id,
        userId: DEV_USER_ID,
        platform: 'youtube',
        platformChannelId: ch.platformChannelId,
        name: ch.name,
        iconUrl: PLACEHOLDER_CHANNEL_ICON,
        uploadsPlaylistId: ch.uploadsPlaylistId,
        categoryId: ch.categoryId,
        isActive: true,
        lastPolledAt: d(-2), // 2 hours ago from base date
      },
    })
  }
  console.log(`  Channels created (${channels.length})`)

  // 7. Contents
  interface ContentDef {
    id: string
    channelId: string
    platformContentId: string
    title: string
    type: ContentType
    status: ContentStatus
    publishedAt: Date | null
    scheduledStartAt: Date | null
    actualStartAt: Date | null
    actualEndAt: Date | null
    contentAt: Date
  }

  const contents: ContentDef[] = [
    // ゲーム実況チャンネル (3 contents)
    { id: CT[0], channelId: CH[0], platformContentId: 'vid_game01_01', title: '【実況】話題の新作RPGを初見プレイ #1', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-120), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-120) },
    { id: CT[1], channelId: CH[0], platformContentId: 'vid_game01_02', title: '【生配信】視聴者参加型マルチプレイ', type: ContentType.LIVE, status: ContentStatus.LIVE, publishedAt: null, scheduledStartAt: d(-2), actualStartAt: d(-1), actualEndAt: null, contentAt: d(-1) },
    { id: CT[2], channelId: CH[0], platformContentId: 'vid_game01_03', title: '【予告】来週の配信スケジュール', type: ContentType.LIVE, status: ContentStatus.UPCOMING, publishedAt: null, scheduledStartAt: d(48), actualStartAt: null, actualEndAt: null, contentAt: d(48) },

    // レトロゲーム研究所 (3 contents)
    { id: CT[3], channelId: CH[1], platformContentId: 'vid_game02_01', title: 'スーパーファミコン名作ランキング TOP20', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-96), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-96) },
    { id: CT[4], channelId: CH[1], platformContentId: 'vid_game02_02', title: 'ゲームボーイの隠れた名作を発掘', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-48), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-48) },

    // FPS最前線 (2 contents)
    { id: CT[5], channelId: CH[2], platformContentId: 'vid_game03_01', title: '新シーズン武器バランス徹底解説', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-72), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-72) },
    { id: CT[6], channelId: CH[2], platformContentId: 'vid_game03_02', title: '大会直前！プロ選手インタビュー', type: ContentType.LIVE, status: ContentStatus.ARCHIVED, publishedAt: null, scheduledStartAt: d(-30), actualStartAt: d(-29), actualEndAt: d(-27), contentAt: d(-29) },

    // インディーゲーム紹介 (2 contents)
    { id: CT[7], channelId: CH[3], platformContentId: 'vid_game04_01', title: '2026年注目インディーゲーム10選', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-60), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-60) },
    { id: CT[8], channelId: CH[3], platformContentId: 'vid_game04_02', title: '開発者に聞く！制作秘話スペシャル', type: ContentType.LIVE, status: ContentStatus.UPCOMING, publishedAt: null, scheduledStartAt: d(24), actualStartAt: null, actualEndAt: null, contentAt: d(24) },

    // DTMクリエイター (3 contents)
    { id: CT[9], channelId: CH[4], platformContentId: 'vid_music01_01', title: '初心者向けDTM講座 #15 ミキシング基礎', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-80), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-80) },
    { id: CT[10], channelId: CH[4], platformContentId: 'vid_music01_02', title: 'オリジナル曲制作ライブ', type: ContentType.LIVE, status: ContentStatus.ARCHIVED, publishedAt: null, scheduledStartAt: d(-50), actualStartAt: d(-49), actualEndAt: d(-46), contentAt: d(-49) },

    // ギター教室Online (2 contents)
    { id: CT[11], channelId: CH[5], platformContentId: 'vid_music02_01', title: 'アコギで弾ける定番ポップス5曲', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-100), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-100) },
    { id: CT[12], channelId: CH[5], platformContentId: 'vid_music02_02', title: '質問コーナー配信', type: ContentType.LIVE, status: ContentStatus.UPCOMING, publishedAt: null, scheduledStartAt: d(72), actualStartAt: null, actualEndAt: null, contentAt: d(72) },

    // クラシック名曲集 (2 contents)
    { id: CT[13], channelId: CH[6], platformContentId: 'vid_music03_01', title: 'ベートーヴェン交響曲第9番 全楽章解説', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-110), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-110) },
    { id: CT[14], channelId: CH[6], platformContentId: 'vid_music03_02', title: 'モーツァルト ピアノソナタ特集', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-40), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-40) },

    // Vocaloid新曲まとめ (2 contents)
    { id: CT[15], channelId: CH[7], platformContentId: 'vid_music04_01', title: '今週のボカロ新曲ベスト10', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-24), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-24) },
    { id: CT[16], channelId: CH[7], platformContentId: 'vid_music04_02', title: '殿堂入りボカロ曲メドレー', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-70), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-70) },

    // Web開発チュートリアル (3 contents)
    { id: CT[17], channelId: CH[8], platformContentId: 'vid_tech01_01', title: 'Next.js 15 新機能完全ガイド', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-90), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-90) },
    { id: CT[18], channelId: CH[8], platformContentId: 'vid_tech01_02', title: 'TypeScript 6.0 ハンズオン', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-36), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-36) },
    { id: CT[19], channelId: CH[8], platformContentId: 'vid_tech01_03', title: 'ライブコーディング: ToDoアプリ構築', type: ContentType.LIVE, status: ContentStatus.LIVE, publishedAt: null, scheduledStartAt: d(-3), actualStartAt: d(-2), actualEndAt: null, contentAt: d(-2) },

    // AI最新ニュース (3 contents)
    { id: CT[20], channelId: CH[9], platformContentId: 'vid_tech02_01', title: '大規模言語モデルの最新動向 2026年3月', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-18), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-18) },
    { id: CT[21], channelId: CH[9], platformContentId: 'vid_tech02_02', title: 'AIコーディングツール比較レビュー', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-55), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-55) },
    { id: CT[22], channelId: CH[9], platformContentId: 'vid_tech02_03', title: '【速報】新AIモデル発表会', type: ContentType.LIVE, status: ContentStatus.CANCELLED, publishedAt: null, scheduledStartAt: d(-10), actualStartAt: null, actualEndAt: null, contentAt: d(-10) },

    // Linux活用術 (2 contents)
    { id: CT[23], channelId: CH[10], platformContentId: 'vid_tech03_01', title: 'Arch Linux インストールガイド 2026', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-85), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-85) },
    { id: CT[24], channelId: CH[10], platformContentId: 'vid_tech03_02', title: 'Neovim設定を一から構築', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-20), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-20) },

    // セキュリティ講座 (2 contents)
    { id: CT[25], channelId: CH[11], platformContentId: 'vid_tech04_01', title: 'Webアプリ脆弱性入門 OWASP Top 10', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-65), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-65) },
    { id: CT[26], channelId: CH[11], platformContentId: 'vid_tech04_02', title: 'パスワード管理の最新ベストプラクティス', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-12), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-12) },

    // 時短レシピの達人 (3 contents)
    { id: CT[27], channelId: CH[12], platformContentId: 'vid_cook01_01', title: '15分で作れる！平日晩ごはん5品', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-78), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-78) },
    { id: CT[28], channelId: CH[12], platformContentId: 'vid_cook01_02', title: '冷凍食品アレンジレシピ特集', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-30), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-30) },
    { id: CT[29], channelId: CH[12], platformContentId: 'vid_cook01_03', title: '【生配信】視聴者リクエスト料理', type: ContentType.LIVE, status: ContentStatus.UPCOMING, publishedAt: null, scheduledStartAt: d(6), actualStartAt: null, actualEndAt: null, contentAt: d(6) },

    // プロの和食 (2 contents)
    { id: CT[30], channelId: CH[13], platformContentId: 'vid_cook02_01', title: '出汁の取り方 完全版', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-105), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-105) },
    { id: CT[31], channelId: CH[13], platformContentId: 'vid_cook02_02', title: '季節の天ぷら盛り合わせ', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-45), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-45) },

    // お菓子作りLab (3 contents)
    { id: CT[32], channelId: CH[14], platformContentId: 'vid_cook03_01', title: 'フランス菓子の基本: マカロン', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-88), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-88) },
    { id: CT[33], channelId: CH[14], platformContentId: 'vid_cook03_02', title: 'チョコレートテンパリング講座', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-25), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-25) },
    { id: CT[34], channelId: CH[14], platformContentId: 'vid_cook03_03', title: 'ホワイトデーケーキ作り配信', type: ContentType.LIVE, status: ContentStatus.ARCHIVED, publishedAt: null, scheduledStartAt: d(-8), actualStartAt: d(-7), actualEndAt: d(-4), contentAt: d(-7) },

    // お笑いハイライト (3 contents)
    { id: CT[35], channelId: CH[15], platformContentId: 'vid_ent01_01', title: '今月のベスト漫才コント集', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-75), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-75) },
    { id: CT[36], channelId: CH[15], platformContentId: 'vid_ent01_02', title: '即興コントバトル', type: ContentType.LIVE, status: ContentStatus.ARCHIVED, publishedAt: null, scheduledStartAt: d(-42), actualStartAt: d(-41), actualEndAt: d(-39), contentAt: d(-41) },
    { id: CT[37], channelId: CH[15], platformContentId: 'vid_ent01_03', title: 'お笑い芸人コラボ配信', type: ContentType.LIVE, status: ContentStatus.UPCOMING, publishedAt: null, scheduledStartAt: d(12), actualStartAt: null, actualEndAt: null, contentAt: d(12) },

    // 映画レビュー館 (2 contents)
    { id: CT[38], channelId: CH[16], platformContentId: 'vid_ent02_01', title: '2026年春公開 注目映画5選', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-35), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-35) },
    { id: CT[39], channelId: CH[16], platformContentId: 'vid_ent02_02', title: 'アカデミー賞予想スペシャル', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-15), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-15) },

    // アニメ考察ch (3 contents)
    { id: CT[40], channelId: CH[17], platformContentId: 'vid_ent03_01', title: '今期アニメ全作品レビュー', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-68), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-68) },
    { id: CT[41], channelId: CH[17], platformContentId: 'vid_ent03_02', title: '名作アニメの伏線を徹底解説', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-22), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-22) },
    { id: CT[42], channelId: CH[17], platformContentId: 'vid_ent03_03', title: 'アニメ談義ライブ', type: ContentType.LIVE, status: ContentStatus.LIVE, publishedAt: null, scheduledStartAt: d(-4), actualStartAt: d(-3), actualEndAt: null, contentAt: d(-3) },

    // VTuber切り抜き (2 contents)
    { id: CT[43], channelId: CH[18], platformContentId: 'vid_ent04_01', title: '今週の切り抜きハイライト', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-16), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-16) },
    { id: CT[44], channelId: CH[18], platformContentId: 'vid_ent04_02', title: 'コラボ配信名場面まとめ', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-52), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-52) },

    // 雑学チャンネル (2 contents - uncategorized)
    { id: CT[45], channelId: CH[19], platformContentId: 'vid_uncat01_01', title: '知って得する豆知識100連発', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-95), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-95) },
    { id: CT[46], channelId: CH[19], platformContentId: 'vid_uncat01_02', title: '世界のびっくり雑学クイズ', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-38), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-38) },

    // 旅行Vlog (2 contents - uncategorized)
    { id: CT[47], channelId: CH[20], platformContentId: 'vid_uncat02_01', title: '北海道一周旅行 Day 1', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-82), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-82) },
    { id: CT[48], channelId: CH[20], platformContentId: 'vid_uncat02_02', title: '沖縄グルメ旅', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-28), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-28) },

    // DIY工房 (2 contents - uncategorized)
    { id: CT[49], channelId: CH[21], platformContentId: 'vid_uncat03_01', title: '100均素材でDIY棚作り', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-58), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-58) },
    { id: CT[50], channelId: CH[21], platformContentId: 'vid_uncat03_02', title: 'ウッドデッキDIY完全版', type: ContentType.VIDEO, status: ContentStatus.ARCHIVED, publishedAt: d(-14), scheduledStartAt: null, actualStartAt: null, actualEndAt: null, contentAt: d(-14) },
  ]

  for (const ct of contents) {
    await prisma.content.upsert({
      where: {
        platform_platformContentId: {
          platform: 'youtube',
          platformContentId: ct.platformContentId,
        },
      },
      update: {},
      create: {
        id: ct.id,
        channelId: ct.channelId,
        platform: 'youtube',
        platformContentId: ct.platformContentId,
        title: ct.title,
        type: ct.type,
        status: ct.status,
        publishedAt: ct.publishedAt,
        scheduledStartAt: ct.scheduledStartAt,
        actualStartAt: ct.actualStartAt,
        actualEndAt: ct.actualEndAt,
        contentAt: ct.contentAt,
        url: `${YOUTUBE_URL}${ct.platformContentId}`,
      },
    })
  }
  console.log(`  Contents created (${contents.length})`)

  // 8. WatchLater
  const watchLaterItems = [
    // MANUAL, active (no expiry)
    {
      userId: DEV_USER_ID,
      contentId: CT[0], // ゲーム実況 RPG #1
      addedVia: WatchLaterSource.MANUAL,
      removedVia: null,
      expiresAt: null,
    },
    // MANUAL, active
    {
      userId: DEV_USER_ID,
      contentId: CT[17], // Next.js 15 新機能
      addedVia: WatchLaterSource.MANUAL,
      removedVia: null,
      expiresAt: null,
    },
    // AUTO, active (with expiry)
    {
      userId: DEV_USER_ID,
      contentId: CT[5], // FPS 武器バランス
      addedVia: WatchLaterSource.AUTO,
      removedVia: null,
      expiresAt: d(72), // expires in 72 hours from base
    },
    // AUTO, active (with expiry)
    {
      userId: DEV_USER_ID,
      contentId: CT[3], // スーファミ名作ランキング
      addedVia: WatchLaterSource.AUTO,
      removedVia: null,
      expiresAt: d(48),
    },
    // MANUAL, removed
    {
      userId: DEV_USER_ID,
      contentId: CT[9], // DTM講座
      addedVia: WatchLaterSource.MANUAL,
      removedVia: 'MANUAL',
      expiresAt: null,
    },
  ]

  for (const wl of watchLaterItems) {
    await prisma.watchLater.upsert({
      where: {
        userId_contentId: {
          userId: wl.userId,
          contentId: wl.contentId,
        },
      },
      update: {},
      create: {
        userId: wl.userId,
        contentId: wl.contentId,
        addedVia: wl.addedVia,
        removedVia: wl.removedVia,
        expiresAt: wl.expiresAt,
        addedAt: d(-5),
      },
    })
  }
  console.log(`  WatchLater created (${watchLaterItems.length})`)

  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
