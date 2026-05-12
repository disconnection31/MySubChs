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

/**
 * コンテンツ一覧のステータスフィルタで指定可能な値。
 * `CANCELLED` は独立フィルタ `includeCancelled` で制御するため含まない。
 */
export const STATUS_FILTER_VALUES = ['UPCOMING', 'LIVE', 'ARCHIVED'] as const

export type ContentStatusFilter = (typeof STATUS_FILTER_VALUES)[number]

/**
 * STATUS_FILTER_VALUES を SSoT として STATUS_OPTIONS からラベルを引く。
 * STATUS_OPTIONS に新値が追加されたが STATUS_FILTER_VALUES を更新し忘れた場合でも、
 * 派生先の OPTIONS には未対応値が混入しない（型述語で narrow するだけだと runtime 不整合のリスクが残る）。
 */
export const STATUS_FILTER_OPTIONS: ReadonlyArray<{
  value: ContentStatusFilter
  label: string
}> = STATUS_FILTER_VALUES.map((value) => {
  const opt = STATUS_OPTIONS.find((o) => o.value === value)
  if (!opt) {
    throw new Error(`STATUS_OPTIONS に ${value} のエントリがありません`)
  }
  return { value, label: opt.label }
})

export function isContentStatusFilter(value: string): value is ContentStatusFilter {
  return (STATUS_FILTER_VALUES as readonly string[]).includes(value)
}

/**
 * 任意の文字列配列を ContentStatusFilter[] に正規化する。
 * 各値を trim した上で無効値を除外し、`STATUS_FILTER_VALUES` の宣言順に並べ替える。
 * URL / queryKey を安定化させるため、入力順序に関わらず同じ結果を返す。
 */
export function normalizeStatusFilter(values: readonly string[]): ContentStatusFilter[] {
  const trimmed = values.map((v) => v.trim())
  return STATUS_FILTER_VALUES.filter((v) => trimmed.includes(v))
}

/**
 * 「有効になっているフィルタ」の個数（0〜3）。バッジ表示およびクリアボタンの可視判定に使う。
 * status 配列は項目が1つ以上あれば 1 とカウント。
 */
export function countActiveFilters(state: {
  status: readonly ContentStatusFilter[]
  watchLaterOnly: boolean
  includeCancelled: boolean
}): number {
  return (
    (state.watchLaterOnly ? 1 : 0) +
    (state.includeCancelled ? 1 : 0) +
    (state.status.length > 0 ? 1 : 0)
  )
}

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
