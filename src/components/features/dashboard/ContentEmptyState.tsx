type ContentEmptyStateProps = {
  watchLaterOnly: boolean
  hasChannelsInCategory?: boolean
}

export function ContentEmptyState({
  watchLaterOnly,
  hasChannelsInCategory = true,
}: ContentEmptyStateProps) {
  const getMessage = () => {
    if (watchLaterOnly) {
      return '「後で見る」に登録されたコンテンツはありません。'
    }
    if (!hasChannelsInCategory) {
      return 'このカテゴリにはチャンネルが割り当てられていません。チャンネル管理画面で割り当ててください。'
    }
    return 'このカテゴリにはまだコンテンツがありません。次のポーリング後に表示されます。'
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-muted-foreground">{getMessage()}</p>
    </div>
  )
}
