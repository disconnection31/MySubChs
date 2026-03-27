'use client'

import { Suspense } from 'react'

import { DashboardPage } from '@/components/features/dashboard/DashboardPage'

export default function Home() {
  return (
    <Suspense>
      <DashboardPage />
    </Suspense>
  )
}
