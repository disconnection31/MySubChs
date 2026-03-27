import { syncChannels } from '@/lib/sync-channels'
import { ensureValidToken } from '@/lib/tokenRefresh'

/**
 * 初回セットアップジョブ: チャンネル同期のみ行い、ポーリングは行わない。
 * 未分類チャンネルはポーリング対象外のため。
 */
export async function executeSetupJob(userId: string): Promise<void> {
  console.info(`[setup] Starting setup job for userId=${userId}`)

  const tokenResult = await ensureValidToken(userId)
  if (!tokenResult.success) {
    // token_error 既存の場合はリトライしても無意味なためスキップ
    if (tokenResult.error.startsWith('Token previously failed:')) {
      console.info(`[setup] Skipping setup for userId=${userId}: ${tokenResult.error}`)
      return
    }
    throw new Error(`[setup] Token refresh failed for userId=${userId}: ${tokenResult.error}`)
  }

  const result = await syncChannels(userId, tokenResult.accessToken)
  console.info(
    `[setup] Channel sync completed for userId=${userId}: ` +
    `added=${result.added}, restored=${result.restored}, ` +
    `deactivated=${result.deactivated}, updated=${result.updated}`,
  )
}
