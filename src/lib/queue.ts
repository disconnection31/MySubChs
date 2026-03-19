import { Queue } from 'bullmq'

import { redis } from '@/lib/redis'

/**
 * BullMQ Queue — Worker・API の両方からジョブをエンキューするために共有する。
 * キュー名は 'mysubchs' で統一し、ジョブ名で種別を区別する。
 */
export const queue = new Queue('mysubchs', {
  connection: redis,
})
