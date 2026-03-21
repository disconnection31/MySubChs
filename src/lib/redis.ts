import IORedis from 'ioredis'
import type { ConnectionOptions } from 'bullmq'

/**
 * BullMQ / Redis 共通の IORedis クライアント。
 * REDIS_URL 環境変数から接続先を解決する。
 */
export const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // BullMQ が要求する設定
})

/** BullMQ の connection オプション用にキャスト済みのインスタンス */
export const bullmqConnection = redis as unknown as ConnectionOptions
