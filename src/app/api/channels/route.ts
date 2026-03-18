import { NextResponse } from 'next/server'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'

import { formatChannel } from './helpers'

export async function GET(request: Request) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const url = new URL(request.url)

    // isActive filter: defaults to true when omitted
    const isActiveParam = url.searchParams.get('isActive')
    let isActive = true
    if (isActiveParam === 'false') {
      isActive = false
    }

    // categoryId filter: supports UUID or 'uncategorized' keyword
    const categoryIdParam = url.searchParams.get('categoryId')
    let categoryIdFilter: string | null | undefined = undefined
    if (categoryIdParam === 'uncategorized') {
      categoryIdFilter = null // null means uncategorized (categoryId IS NULL)
    } else if (categoryIdParam) {
      categoryIdFilter = categoryIdParam
    }

    const where: {
      userId: string
      isActive: boolean
      categoryId?: string | null
    } = {
      userId: auth.userId,
      isActive,
    }

    if (categoryIdFilter !== undefined) {
      where.categoryId = categoryIdFilter
    }

    const channels = await prisma.channel.findMany({
      where,
    })

    return NextResponse.json(channels.map(formatChannel))
  } catch (error) {
    console.error('[channels] GET error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
