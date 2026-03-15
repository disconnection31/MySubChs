'use client'

import { useState } from 'react'
import { AlertCircle, Plus, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useCategories } from '@/hooks/useCategories'
import { useSettings } from '@/hooks/useSettings'

import { CategoryAddForm } from './CategoryAddForm'
import { CategoryEmptyState } from './CategoryEmptyState'
import { CategoryList } from './CategoryList'
import { CategorySkeleton } from './CategorySkeleton'
import { QuotaWarning } from './QuotaWarning'

export function CategoriesPage() {
  const [showAddForm, setShowAddForm] = useState(false)
  const { data: categories, isLoading, isError, refetch } = useCategories()
  const { data: settings } = useSettings()

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">カテゴリ管理</h1>
        </div>
        <CategorySkeleton />
      </main>
    )
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">カテゴリ管理</h1>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 py-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">
            カテゴリの取得に失敗しました。再読み込みしてください。
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            再読み込み
          </Button>
        </div>
      </main>
    )
  }

  const hasCategories = categories && categories.length > 0

  return (
    <main className="mx-auto max-w-3xl p-4">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">カテゴリ管理</h1>
        <Button
          size="sm"
          onClick={() => setShowAddForm(true)}
          disabled={showAddForm}
        >
          <Plus className="mr-1 h-4 w-4" />
          カテゴリを追加
        </Button>
      </div>

      {/* Quota warning */}
      <div className="mb-4">
        <QuotaWarning settings={settings} />
      </div>

      {/* Category list or empty state */}
      {hasCategories ? (
        <CategoryList categories={categories} />
      ) : (
        <CategoryEmptyState />
      )}

      {/* Add form at the bottom */}
      {showAddForm && (
        <div className="mt-2">
          <CategoryAddForm onClose={() => setShowAddForm(false)} />
        </div>
      )}
    </main>
  )
}
