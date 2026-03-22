import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

import type { ChannelMeta, SubscribedChannel } from '@/lib/platforms/base'
import type { YouTubeAdapter } from '@/lib/platforms/youtube'

import { syncChannels } from './sync-channels'

type MockPrisma = DeepMockProxy<PrismaClient>

vi.mock('@/lib/db', async () => {
  const { mockDeep: md } = await import('vitest-mock-extended')
  const mock = md<PrismaClient>()
  return { default: mock, prisma: mock }
})

async function getPrismaMock(): Promise<MockPrisma> {
  const mod = await vi.importMock<{ prisma: MockPrisma }>('@/lib/db')
  return mod.prisma
}

let prismaMock: MockPrisma

beforeEach(async () => {
  prismaMock = await getPrismaMock()
  mockReset(prismaMock)
})

function createMockAdapter(
  subscribedChannels: SubscribedChannel[],
  channelMetas: ChannelMeta[],
) {
  return {
    getSubscribedChannels: vi.fn().mockResolvedValue(subscribedChannels),
    getChannelMetas: vi.fn().mockResolvedValue(channelMetas),
    getPlaylistItems: vi.fn(),
    getVideoDetails: vi.fn(),
  } as unknown as YouTubeAdapter
}

const USER_ID = 'user-123'
const ACCESS_TOKEN = 'test-access-token'

describe('syncChannels', () => {
  it('should add new channels that are not in DB', async () => {
    const adapter = createMockAdapter(
      [{ platformChannelId: 'UC001', name: 'Channel 1', iconUrl: 'https://icon1.png' }],
      [
        {
          platformChannelId: 'UC001',
          name: 'Channel 1',
          iconUrl: 'https://icon1.png',
          uploadsPlaylistId: 'UU001',
        },
      ],
    )

    prismaMock.channel.findMany.mockResolvedValue([])
    prismaMock.channel.createMany.mockResolvedValue({ count: 1 })

    const result = await syncChannels(USER_ID, ACCESS_TOKEN, adapter)

    expect(result).toEqual({ added: 1, restored: 0, deactivated: 0, updated: 0 })
    expect(prismaMock.channel.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: USER_ID,
          platform: 'youtube',
          platformChannelId: 'UC001',
          name: 'Channel 1',
          iconUrl: 'https://icon1.png',
          uploadsPlaylistId: 'UU001',
          isActive: true,
        },
      ],
      skipDuplicates: true,
    })
  })

  it('should restore inactive channels that are still subscribed on YouTube', async () => {
    const adapter = createMockAdapter(
      [{ platformChannelId: 'UC001', name: 'Channel 1', iconUrl: 'https://icon1.png' }],
      [
        {
          platformChannelId: 'UC001',
          name: 'Channel 1',
          iconUrl: 'https://icon1.png',
          uploadsPlaylistId: 'UU001',
        },
      ],
    )

    prismaMock.channel.findMany.mockResolvedValue([
      {
        id: 'ch-1',
        platformChannelId: 'UC001',
        name: 'Channel 1 Old',
        iconUrl: 'https://old-icon.png',
        uploadsPlaylistId: 'UU001',
        isActive: false,
      },
    ] as never)
    prismaMock.channel.update.mockResolvedValue({} as never)

    const result = await syncChannels(USER_ID, ACCESS_TOKEN, adapter)

    expect(result).toEqual({ added: 0, restored: 1, deactivated: 0, updated: 0 })
    expect(prismaMock.channel.update).toHaveBeenCalledWith({
      where: { id: 'ch-1' },
      data: {
        isActive: true,
        name: 'Channel 1',
        iconUrl: 'https://icon1.png',
        uploadsPlaylistId: 'UU001',
      },
    })
  })

  it('should deactivate channels that are no longer subscribed on YouTube', async () => {
    const adapter = createMockAdapter([], [])

    prismaMock.channel.findMany.mockResolvedValue([
      {
        id: 'ch-1',
        platformChannelId: 'UC001',
        name: 'Channel 1',
        iconUrl: 'https://icon1.png',
        uploadsPlaylistId: 'UU001',
        isActive: true,
      },
    ] as never)

    const result = await syncChannels(USER_ID, ACCESS_TOKEN, adapter)

    expect(result).toEqual({ added: 0, restored: 0, deactivated: 1, updated: 0 })
    expect(prismaMock.channel.update).toHaveBeenCalledWith({
      where: { id: 'ch-1' },
      data: { isActive: false },
    })
  })

  it('should update metadata when channel name, icon, or uploadsPlaylistId changes', async () => {
    const adapter = createMockAdapter(
      [{ platformChannelId: 'UC001', name: 'New Name', iconUrl: 'https://new-icon.png' }],
      [
        {
          platformChannelId: 'UC001',
          name: 'New Name',
          iconUrl: 'https://new-icon.png',
          uploadsPlaylistId: 'UU001-NEW',
        },
      ],
    )

    prismaMock.channel.findMany.mockResolvedValue([
      {
        id: 'ch-1',
        platformChannelId: 'UC001',
        name: 'Old Name',
        iconUrl: 'https://old-icon.png',
        uploadsPlaylistId: 'UU001',
        isActive: true,
      },
    ] as never)
    prismaMock.channel.update.mockResolvedValue({} as never)

    const result = await syncChannels(USER_ID, ACCESS_TOKEN, adapter)

    expect(result).toEqual({ added: 0, restored: 0, deactivated: 0, updated: 1 })
    expect(prismaMock.channel.update).toHaveBeenCalledWith({
      where: { id: 'ch-1' },
      data: {
        name: 'New Name',
        iconUrl: 'https://new-icon.png',
        uploadsPlaylistId: 'UU001-NEW',
      },
    })
  })

  it('should not count as updated when metadata has not changed', async () => {
    const adapter = createMockAdapter(
      [{ platformChannelId: 'UC001', name: 'Channel 1', iconUrl: 'https://icon1.png' }],
      [
        {
          platformChannelId: 'UC001',
          name: 'Channel 1',
          iconUrl: 'https://icon1.png',
          uploadsPlaylistId: 'UU001',
        },
      ],
    )

    prismaMock.channel.findMany.mockResolvedValue([
      {
        id: 'ch-1',
        platformChannelId: 'UC001',
        name: 'Channel 1',
        iconUrl: 'https://icon1.png',
        uploadsPlaylistId: 'UU001',
        isActive: true,
      },
    ] as never)

    const result = await syncChannels(USER_ID, ACCESS_TOKEN, adapter)

    expect(result).toEqual({ added: 0, restored: 0, deactivated: 0, updated: 0 })
    expect(prismaMock.channel.update).not.toHaveBeenCalled()
  })

  it('should handle mixed operations (add, restore, deactivate, update)', async () => {
    const adapter = createMockAdapter(
      [
        { platformChannelId: 'UC001', name: 'Ch1 Updated', iconUrl: 'https://icon1-new.png' },
        { platformChannelId: 'UC002', name: 'Ch2', iconUrl: 'https://icon2.png' },
        { platformChannelId: 'UC004', name: 'Ch4 New', iconUrl: 'https://icon4.png' },
      ],
      [
        {
          platformChannelId: 'UC001',
          name: 'Ch1 Updated',
          iconUrl: 'https://icon1-new.png',
          uploadsPlaylistId: 'UU001',
        },
        {
          platformChannelId: 'UC002',
          name: 'Ch2',
          iconUrl: 'https://icon2.png',
          uploadsPlaylistId: 'UU002',
        },
        {
          platformChannelId: 'UC004',
          name: 'Ch4 New',
          iconUrl: 'https://icon4.png',
          uploadsPlaylistId: 'UU004',
        },
      ],
    )

    prismaMock.channel.findMany.mockResolvedValue([
      // UC001: active, metadata changed -> updated
      {
        id: 'ch-1',
        platformChannelId: 'UC001',
        name: 'Ch1 Old',
        iconUrl: 'https://icon1.png',
        uploadsPlaylistId: 'UU001',
        isActive: true,
      },
      // UC002: inactive, still subscribed -> restored
      {
        id: 'ch-2',
        platformChannelId: 'UC002',
        name: 'Ch2',
        iconUrl: 'https://icon2.png',
        uploadsPlaylistId: 'UU002',
        isActive: false,
      },
      // UC003: active, no longer subscribed -> deactivated
      {
        id: 'ch-3',
        platformChannelId: 'UC003',
        name: 'Ch3',
        iconUrl: 'https://icon3.png',
        uploadsPlaylistId: 'UU003',
        isActive: true,
      },
    ] as never)
    prismaMock.channel.createMany.mockResolvedValue({ count: 1 })
    prismaMock.channel.update.mockResolvedValue({} as never)

    const result = await syncChannels(USER_ID, ACCESS_TOKEN, adapter)

    // UC004 added, UC002 restored, UC003 deactivated, UC001 updated
    expect(result).toEqual({ added: 1, restored: 1, deactivated: 1, updated: 1 })
  })

  it('should return all zeros when no channels exist on YouTube or in DB', async () => {
    const adapter = createMockAdapter([], [])

    prismaMock.channel.findMany.mockResolvedValue([])

    const result = await syncChannels(USER_ID, ACCESS_TOKEN, adapter)

    expect(result).toEqual({ added: 0, restored: 0, deactivated: 0, updated: 0 })
    expect(prismaMock.channel.createMany).not.toHaveBeenCalled()
    expect(prismaMock.channel.update).not.toHaveBeenCalled()
  })
})
