'use client'

export function CategoryEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/50 py-12 text-center">
      <p className="text-muted-foreground">
        カテゴリがまだありません。
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        「+ カテゴリを追加」からカテゴリを作成してください。
      </p>
    </div>
  )
}
