type ContentEmptyStateProps = {
  watchLaterOnly: boolean
}

export function ContentEmptyState({ watchLaterOnly }: ContentEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-muted-foreground">
        {watchLaterOnly
          ? '「後で見る」に登録されたコンテンツはありません。'
          : 'このカテゴリにはまだコンテンツがありません。次のポーリング後に表示されます。'}
      </p>
    </div>
  )
}
