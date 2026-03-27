'use client'

import { Badge } from '@/components/ui/badge'
import { getStatusBadgeConfig } from '@/lib/content-utils'
import type { ContentResponse } from '@/types/api'

type StatusBadgeProps = {
  type: ContentResponse['type']
  status: ContentResponse['status']
}

export function StatusBadge({ type, status }: StatusBadgeProps) {
  const config = getStatusBadgeConfig(type, status)

  return (
    <Badge variant={config.variant} className={config.className}>
      {config.text}
    </Badge>
  )
}
