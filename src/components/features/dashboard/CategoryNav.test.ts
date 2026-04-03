import { describe, expect, it } from 'vitest'

import { getPollingTooltip } from './CategoryNav'

describe('getPollingTooltip', () => {
  it('returns uncategorized message when isUncategorized is true', () => {
    expect(
      getPollingTooltip({
        autoPollingEnabled: true,
        pollingIntervalMinutes: 30,
        globalPollingIntervalMinutes: 30,
        isUncategorized: true,
      }),
    ).toBe('自動ポーリング: 無効（未分類チャンネルは対象外）')
  })

  it('returns disabled message when autoPollingEnabled is false', () => {
    expect(
      getPollingTooltip({
        autoPollingEnabled: false,
        pollingIntervalMinutes: null,
        globalPollingIntervalMinutes: 30,
      }),
    ).toBe('自動ポーリング: 無効（手動のみ）')
  })

  it('returns per-category interval when pollingIntervalMinutes is set', () => {
    expect(
      getPollingTooltip({
        autoPollingEnabled: true,
        pollingIntervalMinutes: 60,
        globalPollingIntervalMinutes: 30,
      }),
    ).toBe('自動ポーリング: 60分ごと')
  })

  it('returns global interval when pollingIntervalMinutes is null and global is available', () => {
    expect(
      getPollingTooltip({
        autoPollingEnabled: true,
        pollingIntervalMinutes: null,
        globalPollingIntervalMinutes: 30,
      }),
    ).toBe('自動ポーリング: グローバル設定（30分）')
  })

  it('returns generic global message when global interval is undefined', () => {
    expect(
      getPollingTooltip({
        autoPollingEnabled: true,
        pollingIntervalMinutes: null,
        globalPollingIntervalMinutes: undefined,
      }),
    ).toBe('自動ポーリング: グローバル設定')
  })

  it('prioritizes isUncategorized over autoPollingEnabled', () => {
    expect(
      getPollingTooltip({
        autoPollingEnabled: false,
        pollingIntervalMinutes: null,
        globalPollingIntervalMinutes: 30,
        isUncategorized: true,
      }),
    ).toBe('自動ポーリング: 無効（未分類チャンネルは対象外）')
  })
})
