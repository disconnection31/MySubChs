import { Worker, Job } from 'bullmq'

import { bullmqConnection, redis } from '@/lib/redis'
import { prisma } from '@/lib/db'
import { ensureValidToken } from '@/lib/tokenRefresh'
import {
  AUTO_POLL_JOB_PREFIX,
  MANUAL_POLL_JOB_PREFIX,
  DEFAULT_POLLING_INTERVAL_MINUTES,
  REDIS_KEY_QUOTA_EXHAUSTED,
  REDIS_KEY_POLLING_LOCK_PREFIX,
  CONTENT_CLEANUP_CRON,
  CONTENT_CLEANUP_JOB_NAME,
  WATCHLATER_CLEANUP_CRON,
  WATCHLATER_CLEANUP_JOB_NAME,
  SETUP_JOB_NAME,
} from '@/lib/config'
import { queue } from '@/lib/queue'
import { YouTubeQuotaExceededError } from '@/lib/platforms/youtube'
import { executePolling, setQuotaExhausted } from './polling'
import { executeContentCleanup } from './contentCleanup'
import { executeSetupJob } from './setup'
import { executeWatchLaterCleanup } from './watchLaterCleanup'

// ---- Types ----

type AutoPollJobData = {
  categoryId: string
}

type ManualPollJobData = {
  categoryId: string
}

type SetupJobData = {
  userId: string
}

type JobData = AutoPollJobData | ManualPollJobData | SetupJobData

// ---- Self-healing (§4): Reconcile BullMQ repeatable jobs with DB state ----

/**
 * 与えられたジョブ名が既知のジョブパターンに一致するかを判定する。
 *
 * 既知パターン:
 * - `auto-poll-*`: カテゴリ単位の自動ポーリング
 * - `content-cleanup`: コンテンツクリーンアップ（完全一致）
 * - `watchlater-cleanup`: Watch Laterクリーンアップ（完全一致）
 * - `setup` / `setup-*`: 初回ログイン時のチャンネル同期
 *   - Issue #157 に `setup-{userId}` と記載があるが、実装は `SETUP_JOB_NAME='setup'` 固定。
 *     歴史的に `setup-*` 形式が使われた可能性を考慮し両対応する。
 *     TODO: 旧形式 `setup-*` が残存していないことを確認できたら `setup-` プレフィックス判定は削除する。
 *           残したままだと `setup-v2` のような新ジョブが意図せず既知扱いとなり削除されないリスクがある。
 *
 * NOTE: `manual-poll-*` は one-shot ジョブであり repeatable には本来登録されないため、
 *       ここでは既知リストに含めない。誤って repeatable 登録された場合は孤児として削除される。
 */
export function isKnownJobName(name: string): boolean {
  if (name.startsWith(AUTO_POLL_JOB_PREFIX)) return true
  if (name === CONTENT_CLEANUP_JOB_NAME) return true
  if (name === WATCHLATER_CLEANUP_JOB_NAME) return true
  if (name === SETUP_JOB_NAME) return true
  if (name.startsWith(`${SETUP_JOB_NAME}-`)) return true
  return false
}

export async function reconcileRepeatableJobs(): Promise<void> {
  console.info('[worker] Starting repeatable job reconciliation...')

  // 1. DB から全カテゴリの設定を取得
  const categories = await prisma.category.findMany({
    include: {
      notificationSetting: {
        select: {
          autoPollingEnabled: true,
          pollingIntervalMinutes: true,
        },
      },
      user: {
        select: {
          userSetting: {
            select: {
              pollingIntervalMinutes: true,
            },
          },
        },
      },
    },
  })

  // effectiveInterval を計算
  const categorySettings = categories.map((cat) => {
    const effectiveInterval =
      cat.notificationSetting?.pollingIntervalMinutes ??
      cat.user.userSetting?.pollingIntervalMinutes ??
      DEFAULT_POLLING_INTERVAL_MINUTES
    return {
      categoryId: cat.id,
      autoPollingEnabled: cat.notificationSetting?.autoPollingEnabled ?? true,
      effectiveIntervalMs: effectiveInterval * 60 * 1000,
    }
  })

  // 2. 既存の Repeatable Jobs を取得
  const existingJobs = await queue.getRepeatableJobs()

  // 2a. 未知のジョブ名（プレフィックス変更等による旧形式残留）を孤児として削除する (Issue #157)
  // 既知のジョブ名パターンに一致しない repeatable ジョブは、ジョブ名の変更や
  // リファクタリングの結果 Redis に取り残された旧形式である可能性が高い。
  // 放置するとポーリングが正常に動作しないため、起動時に除去する。
  for (const job of existingJobs) {
    if (!isKnownJobName(job.name)) {
      await queue.removeRepeatableByKey(job.key)
      console.info(`[worker] Removed unknown orphan job ${job.name}`)
    }
  }

  // 以降の処理では未知ジョブを除いた既知ジョブのみを対象とする
  const knownJobs = existingJobs.filter((j) => isKnownJobName(j.name))

  const existingJobMap = new Map(
    knownJobs
      .filter((j) => j.name.startsWith(AUTO_POLL_JOB_PREFIX))
      .map((j) => [j.name, j]),
  )

  // 3. 不整合を修復
  for (const setting of categorySettings) {
    const jobName = `${AUTO_POLL_JOB_PREFIX}${setting.categoryId}`
    const existing = existingJobMap.get(jobName)

    if (setting.autoPollingEnabled) {
      if (existing) {
        // 間隔ズレチェック
        if (Number(existing.every) !== setting.effectiveIntervalMs) {
          // 旧ジョブ削除 → 新間隔で再登録
          await queue.removeRepeatableByKey(existing.key)
          await queue.add(
            jobName,
            { categoryId: setting.categoryId },
            {
              repeat: { every: setting.effectiveIntervalMs },
              jobId: jobName,
            },
          )
          console.info(
            `[worker] Reconciled job ${jobName}: interval ${existing.every}ms → ${setting.effectiveIntervalMs}ms`,
          )
        }
        // 一致 → 何もしない
      } else {
        // 欠損 → 登録
        await queue.add(
          jobName,
          { categoryId: setting.categoryId },
          {
            repeat: { every: setting.effectiveIntervalMs },
            jobId: jobName,
          },
        )
        console.info(
          `[worker] Registered missing job ${jobName} (every ${setting.effectiveIntervalMs}ms)`,
        )
      }
    } else {
      // autoPollingEnabled=false なのにジョブが存在する → 削除
      if (existing) {
        await queue.removeRepeatableByKey(existing.key)
        console.info(`[worker] Removed stale job ${jobName} (autoPollingEnabled=false)`)
      }
    }

    existingJobMap.delete(jobName)
  }

  // DB に存在しないカテゴリのジョブを削除
  for (const [jobName, job] of Array.from(existingJobMap)) {
    await queue.removeRepeatableByKey(job.key)
    console.info(`[worker] Removed orphan job ${jobName}`)
  }

  // ContentCleanup: cron ベースの Repeatable Job を登録
  // §15: attempts=3, backoff exponential 5分
  const existingCleanupJob = knownJobs.find((j) => j.name === CONTENT_CLEANUP_JOB_NAME)
  if (!existingCleanupJob) {
    await queue.add(
      CONTENT_CLEANUP_JOB_NAME,
      {},
      {
        repeat: { pattern: CONTENT_CLEANUP_CRON },
        jobId: CONTENT_CLEANUP_JOB_NAME,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5 * 60 * 1000 },
      },
    )
    console.info(
      `[worker] Registered content-cleanup job (cron: ${CONTENT_CLEANUP_CRON})`,
    )
  }

  // WatchLaterCleanup: cron ベースの Repeatable Job を登録
  // §15: attempts=3, backoff exponential 5分
  const existingWatchLaterCleanupJob = knownJobs.find((j) => j.name === WATCHLATER_CLEANUP_JOB_NAME)
  if (!existingWatchLaterCleanupJob) {
    await queue.add(
      WATCHLATER_CLEANUP_JOB_NAME,
      {},
      {
        repeat: { pattern: WATCHLATER_CLEANUP_CRON },
        jobId: WATCHLATER_CLEANUP_JOB_NAME,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5 * 60 * 1000 },
      },
    )
    console.info(
      `[worker] Registered watchlater-cleanup job (cron: ${WATCHLATER_CLEANUP_CRON})`,
    )
  }

  console.info('[worker] Repeatable job reconciliation completed')
}

// ---- Job processor ----

async function processJob(job: Job<JobData>): Promise<void> {
  const jobName = job.name

  // auto-poll / manual-poll のジョブを処理
  if (jobName.startsWith(AUTO_POLL_JOB_PREFIX) || jobName.startsWith(MANUAL_POLL_JOB_PREFIX)) {
    const { categoryId } = job.data as AutoPollJobData

    // トークンリフレッシュ: ユーザーIDを取得
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: {
        userId: true,
        notificationSetting: {
          select: { pollingIntervalMinutes: true },
        },
        user: {
          select: {
            userSetting: {
              select: { pollingIntervalMinutes: true },
            },
          },
        },
      },
    })

    if (!category) {
      console.warn(`[worker] Category not found: ${categoryId}`)
      return
    }

    // §13: クォータ枯渇チェック
    const quotaExhausted = await redis.get(REDIS_KEY_QUOTA_EXHAUSTED)
    if (quotaExhausted) {
      console.info(`[worker] Quota exhausted, skipping poll for ${jobName}`)
      return
    }

    const isManual = jobName.startsWith(MANUAL_POLL_JOB_PREFIX)

    // §14: Redis ロックによる重複実行防止（auto-poll のみ）
    if (!isManual) {
      const effectiveInterval =
        category.notificationSetting?.pollingIntervalMinutes ??
        category.user?.userSetting?.pollingIntervalMinutes ??
        DEFAULT_POLLING_INTERVAL_MINUTES
      const intervalMs = effectiveInterval * 60 * 1000
      const lockKey = `${REDIS_KEY_POLLING_LOCK_PREFIX}${categoryId}`
      const lockResult = await redis.set(lockKey, '1', 'PX', intervalMs, 'NX')
      if (lockResult !== 'OK') {
        console.info(`[worker] Polling lock not acquired, skipping ${jobName}`)
        return
      }
    }

    // トークン確認・リフレッシュ
    const tokenResult = await ensureValidToken(category.userId)
    if (!tokenResult.success) {
      // token_error が既にセットされている場合（再認証待ち）は早期 return
      // youtube-auth.md §3: token_error IS NOT NULL → ポーリングをスキップして即時終了
      if (tokenResult.error.startsWith('Token previously failed:')) {
        console.info(
          `[worker] Skipping job ${jobName}: token error already recorded for user ${category.userId}`,
        )
        return
      }

      // リフレッシュ失敗（invalid_grant 等）→ ジョブを FAILED で終了
      // BullMQ の attempts=1 でリトライなし
      throw new Error(`Token refresh failed: ${tokenResult.error}`)
    }

    // ポーリング実行
    try {
      await executePolling(categoryId, tokenResult.accessToken, isManual)
      console.info(`[worker] Job ${jobName} polling completed successfully`)
    } catch (err) {
      if (err instanceof YouTubeQuotaExceededError) {
        // §13: クォータ枯渇 → Redis フラグセット、正常完了として終了
        await setQuotaExhausted()
        return
      }
      throw err
    }
    return
  }

  // content-cleanup ジョブを処理（DB操作のみ、YouTube API不要）
  if (jobName === CONTENT_CLEANUP_JOB_NAME) {
    await executeContentCleanup()
    return
  }

  // watchlater-cleanup ジョブを処理（DB操作のみ、YouTube API不要）
  if (jobName === WATCHLATER_CLEANUP_JOB_NAME) {
    await executeWatchLaterCleanup()
    return
  }

  // setup ジョブを処理（初回ログイン時のチャンネル同期）
  if (jobName === SETUP_JOB_NAME) {
    await executeSetupJob((job.data as SetupJobData).userId)
    return
  }

  // 未知のジョブ種別
  console.warn(`[worker] Unknown job type: ${jobName}`)
}

// ---- Worker setup ----

async function main(): Promise<void> {
  console.info('[worker] Starting BullMQ Worker...')

  // Worker 起動時の自己修復（youtube-polling.md §4）
  await reconcileRepeatableJobs()

  const worker = new Worker('mysubchs', processJob, {
    connection: bullmqConnection,
    concurrency: 1,
  })

  worker.on('completed', (job) => {
    console.info(`[worker] Job completed: ${job.name} (id: ${job.id})`)
  })

  worker.on('failed', (job, err) => {
    console.error(
      `[worker] Job failed: ${job?.name} (id: ${job?.id}): ${err.message}`,
    )
  })

  worker.on('error', (err) => {
    console.error(`[worker] Worker error: ${err.message}`)
  })

  // Graceful shutdown
  const shutdown = async () => {
    console.info('[worker] Shutting down...')
    await worker.close()
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  console.info('[worker] Worker is ready and listening for jobs')
}

// テスト環境では main() を自動実行しない（Vitest が `VITEST` を自動で設定する）。
// これにより `reconcileRepeatableJobs` などの named export を副作用なくテストできる。
if (!process.env.VITEST) {
  main().catch((err) => {
    console.error(`[worker] Fatal error: ${err.message}`)
    process.exit(1)
  })
}
