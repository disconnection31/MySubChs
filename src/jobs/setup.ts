import { prisma } from '@/lib/db'
import { syncChannels } from '@/lib/sync-channels'
import { ensureValidToken } from '@/lib/tokenRefresh'

/**
 * 初回セットアップジョブ。
 *
 * 初回ログイン時に BullMQ 経由で実行され、YouTube チャンネル同期を行う。
 * - ensureValidToken でアクセストークンを取得
 * - syncChannels で YouTube 登録チャンネルを DB に同期
 *
 * 方針: 初回セットアップではチャンネル同期のみ行い、ポーリング（コンテンツ取得）は行わない。
 * 未分類チャンネルはポーリング対象外のため。
 *
 * リトライ: attempts=3, backoff exponential 5s（BullMQ 側で設定）
 * 冪等性: syncChannels は upsert ベースで冪等に設計されている。
 */
export async function executeSetupJob(userId: string): Promise<void> {
  console.info(`[setup] Starting setup job for userId=${userId}`)

  // token_error が既にセットされている場合はリトライしても無意味なため早期 return
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
    select: { token_error: true },
  })

  if (account?.token_error) {
    console.info(
      `[setup] Skipping setup for userId=${userId}: token_error already recorded (${account.token_error})`,
    )
    return
  }

  // アクセストークンを取得（リフレッシュが必要なら自動で行う）
  const tokenResult = await ensureValidToken(userId)
  if (!tokenResult.success) {
    // token_error IS NOT NULL の場合は ensureValidToken 内で
    // "Token previously failed:" プレフィックス付きのエラーが返る。
    // 上の早期 return で既にカバーしているが、念のためここでもチェック。
    if (tokenResult.error.startsWith('Token previously failed:')) {
      console.info(
        `[setup] Skipping setup for userId=${userId}: token previously failed`,
      )
      return
    }

    // その他のトークンエラー → throw して BullMQ のリトライに任せる
    throw new Error(`[setup] Token refresh failed for userId=${userId}: ${tokenResult.error}`)
  }

  // チャンネル同期を実行
  const result = await syncChannels(userId, tokenResult.accessToken)
  console.info(
    `[setup] Channel sync completed for userId=${userId}: ` +
    `added=${result.added}, restored=${result.restored}, ` +
    `deactivated=${result.deactivated}, updated=${result.updated}`,
  )
}
