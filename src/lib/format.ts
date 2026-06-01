/**
 * 手動ポーリング クールダウンの秒数を日本語ラベルにフォーマットする。
 *
 * - 60 秒未満: `${秒}秒間隔`
 * - 60 秒以上で割り切れる: `${分}分間隔`
 * - 60 秒以上で端数あり: `${分}分${秒}秒間隔`
 *
 * @example
 * formatCooldownLabel(30) // => '30秒間隔'
 * formatCooldownLabel(60) // => '1分間隔'
 * formatCooldownLabel(90) // => '1分30秒間隔'
 * formatCooldownLabel(300) // => '5分間隔'
 */
export function formatCooldownLabel(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒間隔`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (remainingSeconds === 0) {
    return `${minutes}分間隔`
  }

  return `${minutes}分${remainingSeconds}秒間隔`
}
