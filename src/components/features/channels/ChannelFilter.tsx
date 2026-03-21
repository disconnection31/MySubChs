'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ChannelFilterProps = {
  isActive: boolean
  onChange: (isActive: boolean) => void
}

export function ChannelFilter({ isActive, onChange }: ChannelFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">表示:</span>
      <Select
        value={isActive ? 'active' : 'inactive'}
        onValueChange={(value) => onChange(value === 'active')}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">アクティブのみ</SelectItem>
          <SelectItem value="inactive">解除済みのみ</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
