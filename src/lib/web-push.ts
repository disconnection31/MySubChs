import webPush from 'web-push'

// VAPID keys for Web Push authentication
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? ''
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? ''

if (VAPID_SUBJECT && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

export type PushPayload = {
  title: string
  body: string
  icon?: string
  data?: { url?: string }
}

export type PushSubscriptionData = {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

/**
 * Send a Web Push notification to a single subscription.
 * Returns true if successful, false if the subscription is gone (410/404).
 * Throws on other errors.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload,
): Promise<boolean> {
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload))
    return true
  } catch (error) {
    if (isSubscriptionGone(error)) {
      return false
    }
    throw error
  }
}

/**
 * Check if a web-push error indicates the subscription is no longer valid.
 * HTTP 410 Gone or 404 Not Found means the subscription should be removed.
 */
export function isSubscriptionGone(error: unknown): boolean {
  if (
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  ) {
    const statusCode = (error as { statusCode: number }).statusCode
    return statusCode === 410 || statusCode === 404
  }
  return false
}
