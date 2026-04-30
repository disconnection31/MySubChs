import type { ContentResponse } from '@/types/api'

type ContentStatus = ContentResponse['status']

/**
 * ステータス手動変更メニューの選択肢。
 * ContentItem のケバブメニューから利用する。
 */
export const STATUS_OPTIONS: ReadonlyArray<{ value: ContentStatus; label: string }> = [
  { value: 'UPCOMING', label: '配信予定' },
  { value: 'LIVE', label: '配信中' },
  { value: 'ARCHIVED', label: 'アーカイブ' },
  { value: 'CANCELLED', label: 'キャンセル済み' },
]

type StatusBadgeConfig = {
  text: string
  className: string
  variant: 'destructive' | 'default' | 'outline'
}

export function getStatusBadgeConfig(
  type: ContentResponse['type'],
  status: ContentResponse['status'],
): StatusBadgeConfig {
  if (type === 'LIVE' && status === 'LIVE') {
    return { text: '配信中', className: '', variant: 'destructive' }
  }
  if (type === 'LIVE' && status === 'UPCOMING') {
    return {
      text: '配信予定',
      className: 'bg-blue-600 text-white border-transparent',
      variant: 'default',
    }
  }
  if (type === 'LIVE' && status === 'ARCHIVED') {
    return {
      text: 'アーカイブ',
      className: 'bg-green-600 text-white border-transparent',
      variant: 'default',
    }
  }
  if (type === 'VIDEO' && status === 'ARCHIVED') {
    return {
      text: '動画',
      className: 'border-green-600 text-green-600',
      variant: 'outline',
    }
  }
  if (type === 'SHORT' && status === 'ARCHIVED') {
    return {
      text: 'ショート',
      className: 'border-purple-600 text-purple-600',
      variant: 'outline',
    }
  }
  if (type === 'LIVE' && status === 'CANCELLED') {
    return {
      text: 'キャンセル済み',
      className: 'text-muted-foreground',
      variant: 'outline',
    }
  }
  // Fallback (should not normally occur)
  return { text: status, className: '', variant: 'outline' }
}

export function formatLocalDateTime(isoString: string): string {
  const date = new Date(isoString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}/${month}/${day} ${hours}:${minutes}`
}

export function getContentDateText(content: ContentResponse): string | null {
  const { type, status } = content

  if ((type === 'VIDEO' || type === 'SHORT') && status === 'ARCHIVED') {
    return content.publishedAt ? formatLocalDateTime(content.publishedAt) : null
  }

  if (type === 'LIVE' && status === 'UPCOMING') {
    return content.scheduledStartAt
      ? `配信予定: ${formatLocalDateTime(content.scheduledStartAt)}`
      : null
  }

  if (type === 'LIVE' && status === 'LIVE') {
    return content.actualStartAt
      ? `配信開始: ${formatLocalDateTime(content.actualStartAt)}`
      : null
  }

  if (type === 'LIVE' && status === 'ARCHIVED') {
    const dateStr = content.actualStartAt ?? content.scheduledStartAt
    return dateStr ? formatLocalDateTime(dateStr) : null
  }

  if (type === 'LIVE' && status === 'CANCELLED') {
    return content.scheduledStartAt
      ? `予定: ${formatLocalDateTime(content.scheduledStartAt)}`
      : null
  }

  return null
}
