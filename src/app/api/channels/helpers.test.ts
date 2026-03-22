import { describe, it, expect } from 'vitest'
import type { Channel } from '@prisma/client'
import { formatChannel } from './helpers'

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'ch-1',
    userId: 'user-1',
    platform: 'youtube',
    platformChannelId: 'UC123',
    name: 'テストチャンネル',
    iconUrl: 'https://example.com/icon.jpg',
    categoryId: 'cat-1',
    isActive: true,
    uploadsPlaylistId: 'UU123',
    lastPolledAt: new Date('2026-01-01T12:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('formatChannel', () => {
  it('Channelをレスポンス形式に変換する', () => {
    const channel = makeChannel()
    const result = formatChannel(channel)

    expect(result).toEqual({
      id: 'ch-1',
      platform: 'youtube',
      platformChannelId: 'UC123',
      name: 'テストチャンネル',
      iconUrl: 'https://example.com/icon.jpg',
      categoryId: 'cat-1',
      isActive: true,
      lastPolledAt: '2026-01-01T12:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('DateフィールドをISO文字列に変換する', () => {
    const channel = makeChannel({
      createdAt: new Date('2026-06-15T10:30:00.000Z'),
      updatedAt: new Date('2026-06-16T14:45:00.000Z'),
      lastPolledAt: new Date('2026-06-16T15:00:00.000Z'),
    })
    const result = formatChannel(channel)

    expect(result.createdAt).toBe('2026-06-15T10:30:00.000Z')
    expect(result.updatedAt).toBe('2026-06-16T14:45:00.000Z')
    expect(result.lastPolledAt).toBe('2026-06-16T15:00:00.000Z')
  })

  it('lastPolledAtがnullの場合、nullを返す', () => {
    const channel = makeChannel({ lastPolledAt: null })
    const result = formatChannel(channel)

    expect(result.lastPolledAt).toBeNull()
  })

  it('lastPolledAtがnullでない場合、ISO文字列に変換する', () => {
    const channel = makeChannel({ lastPolledAt: new Date('2026-03-20T08:00:00.000Z') })
    const result = formatChannel(channel)

    expect(result.lastPolledAt).toBe('2026-03-20T08:00:00.000Z')
  })

  it('iconUrlがnullの場合、nullを返す', () => {
    const channel = makeChannel({ iconUrl: null })
    const result = formatChannel(channel)

    expect(result.iconUrl).toBeNull()
  })

  it('categoryIdがnullの場合、nullを返す', () => {
    const channel = makeChannel({ categoryId: null })
    const result = formatChannel(channel)

    expect(result.categoryId).toBeNull()
  })
})
