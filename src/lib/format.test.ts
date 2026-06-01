import { describe, expect, it } from 'vitest'

import { formatCooldownLabel } from '@/lib/format'

describe('formatCooldownLabel', () => {
  it('30 秒は「30秒間隔」を返す', () => {
    expect(formatCooldownLabel(30)).toBe('30秒間隔')
  })

  it('59 秒は「59秒間隔」を返す', () => {
    expect(formatCooldownLabel(59)).toBe('59秒間隔')
  })

  it('60 秒は「1分間隔」を返す', () => {
    expect(formatCooldownLabel(60)).toBe('1分間隔')
  })

  it('90 秒は「1分30秒間隔」を返す', () => {
    expect(formatCooldownLabel(90)).toBe('1分30秒間隔')
  })

  it('300 秒は「5分間隔」を返す', () => {
    expect(formatCooldownLabel(300)).toBe('5分間隔')
  })

  it('600 秒は「10分間隔」を返す', () => {
    expect(formatCooldownLabel(600)).toBe('10分間隔')
  })

  it('150 秒は「2分30秒間隔」を返す', () => {
    expect(formatCooldownLabel(150)).toBe('2分30秒間隔')
  })

  it('0 秒は「0秒間隔」を返す', () => {
    expect(formatCooldownLabel(0)).toBe('0秒間隔')
  })
})
