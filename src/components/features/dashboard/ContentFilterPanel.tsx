'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  STATUS_FILTER_OPTIONS,
  type ContentStatusFilter,
} from '@/lib/content-utils'

type ContentFilterPanelProps = {
  status: ContentStatusFilter[]
  watchLaterOnly: boolean
  includeCancelled: boolean
  onChangeStatus: (next: ContentStatusFilter[]) => void
  onToggleWatchLaterOnly: () => void
  onToggleIncludeCancelled: () => void
  onClear: () => void
  activeFilterCount: number
}

export function ContentFilterPanel({
  status,
  watchLaterOnly,
  includeCancelled,
  onChangeStatus,
  onToggleWatchLaterOnly,
  onToggleIncludeCancelled,
  onClear,
  activeFilterCount,
}: ContentFilterPanelProps) {
  const handleToggleStatus = (value: ContentStatusFilter, checked: boolean) => {
    if (checked) {
      if (status.includes(value)) return
      onChangeStatus([...status, value])
    } else {
      onChangeStatus(status.filter((s) => s !== value))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-2">
        <p className="text-sm font-semibold">ステータス</p>
        <div className="flex flex-col gap-2">
          {STATUS_FILTER_OPTIONS.map((option) => {
            const id = `filter-status-${option.value}`
            const checked = status.includes(option.value)
            return (
              <label
                key={option.value}
                htmlFor={id}
                className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={(value) =>
                    handleToggleStatus(option.value, value === true)
                  }
                />
                <span>{option.label}</span>
              </label>
            )
          })}
        </div>
      </section>

      <div className="h-px bg-border" aria-hidden="true" />

      <section className="flex flex-col gap-2">
        <p className="text-sm font-semibold">後で見る</p>
        <label
          htmlFor="filter-watch-later-only"
          className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm"
        >
          <span>後で見るがONのコンテンツのみ表示</span>
          <Switch
            id="filter-watch-later-only"
            checked={watchLaterOnly}
            onCheckedChange={onToggleWatchLaterOnly}
          />
        </label>
      </section>

      <div className="h-px bg-border" aria-hidden="true" />

      <section className="flex flex-col gap-2">
        <p className="text-sm font-semibold">キャンセル済み</p>
        <label
          htmlFor="filter-include-cancelled"
          className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm"
        >
          <span>キャンセル済みも表示</span>
          <Switch
            id="filter-include-cancelled"
            checked={includeCancelled}
            onCheckedChange={onToggleIncludeCancelled}
          />
        </label>
      </section>

      {activeFilterCount > 0 && (
        <>
          <div className="h-px bg-border" aria-hidden="true" />
          <Button variant="outline" size="sm" onClick={onClear} className="w-full">
            フィルタをクリア
          </Button>
        </>
      )}
    </div>
  )
}
