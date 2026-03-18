'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateSettings } from '@/hooks/useSettings'
import type { UserSettingsResponse } from '@/types/api'

const RETENTION_OPTIONS = [
  { label: '1ヶ月', value: '30' },
  { label: '2ヶ月（デフォルト）', value: '60' },
  { label: '3ヶ月', value: '90' },
  { label: '6ヶ月', value: '180' },
  { label: '1年', value: '365' },
] as const

type Props = {
  settings: UserSettingsResponse
}

export function ContentSection({ settings }: Props) {
  const updateSettings = useUpdateSettings()

  const handleRetentionChange = (value: string) => {
    updateSettings.mutate({ contentRetentionDays: Number(value) })
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">コンテンツ設定</h2>
      <div className="border-t pt-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">コンテンツ保持期間</span>
          <Select
            value={String(settings.contentRetentionDays)}
            onValueChange={handleRetentionChange}
            disabled={updateSettings.isPending}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETENTION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          指定期間を超えた動画・ライブ履歴を自動削除します。
          <br />
          変更は次回の自動削除処理（毎日1回）から反映されます。
        </p>
      </div>
    </section>
  )
}
