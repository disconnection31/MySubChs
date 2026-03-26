import { Worker, Job } from 'bullmq'

import { bullmqConnection, redis } from '@/lib/redis'
import { prisma } from '@/lib/db'
import { ensureValidToken } from '@/lib/tokenRefresh'
import {
  DEFAULT_POLLING_INTERVAL_MINUTES,
  REDIS_KEY_QUOTA_EXHAUSTED,
  REDIS_KEY_POLLING_LOCK_PREFIX,
  CONTENT_CLEANUP_CRON,
  CONTENT_CLEANUP_JOB_NAME,
} from '@/lib/config'
import { queue } from '@/lib/queue'
import { YouTubeQuotaExceededError } from '@/lib/platforms/youtube'
import { executePolling, setQuotaExhausted } from './polling'
import { executeContentCleanup } from './contentCleanup'

// ---- Types ----

type AutoPollJobData = {
  categoryId: string
}

type ManualPollJobData = {
  categoryId: string
}

type JobData = AutoPollJobData | ManualPollJobData

// ---- Self-healing (§4): Reconcile BullMQ repeatable jobs with DB state ----

async function reconcileRepeatableJobs(): Promise<void> {
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
  const existingJobMap = new Map(
    existingJobs
      .filter((j) => j.name.startsWith('auto-poll:'))
      .map((j) => [j.name, j]),
  )

  // 3. 不整合を修復
  for (const setting of categorySettings) {
    const jobName = `auto-poll:${setting.categoryId}`
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
  const existingCleanupJob = existingJobs.find((j) => j.name === CONTENT_CLEANUP_JOB_NAME)
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

  console.info('[worker] Repeatable job reconciliation completed')
}

// ---- Job processor ----

async function processJob(job: Job<JobData>): Promise<void> {
  const jobName = job.name

  // auto-poll / manual-poll のジョブを処理
  if (jobName.startsWith('auto-poll:') || jobName.startsWith('manual-poll:')) {
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

    const isManual = jobName.startsWith('manual-poll:')

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

main().catch((err) => {
  console.error(`[worker] Fatal error: ${err.message}`)
  process.exit(1)
})
