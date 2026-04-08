import { PrismaAdapter } from '@auth/prisma-adapter'
import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

import { Prisma } from '@prisma/client'

import { DEFAULT_CONTENT_RETENTION_DAYS, DEFAULT_POLLING_INTERVAL_MINUTES, GOOGLE_PROVIDER, SETUP_JOB_NAME } from '@/lib/config'
import { prisma } from '@/lib/db'
import { queue } from '@/lib/queue'

export const authOptions: NextAuthOptions = {
  // @auth/prisma-adapter を使用して Account テーブルに OAuth トークンを保存する
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          // youtube.readonly スコープを追加して YouTube API へのアクセスを許可する
          scope:
            'openid email profile https://www.googleapis.com/auth/youtube.readonly',
          // リフレッシュトークンを取得するために access_type=offline を指定する
          access_type: 'offline',
          // 再認証時に必ず consent を表示してリフレッシュトークンを再取得する
          prompt: 'consent',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async signIn({ account }) {
      if (!account) {
        return false
      }

      // 再認証時に token_error を NULL にリセットし、新しいトークンを DB に保存する
      // （youtube-auth.md §4 の仕様: 再認証成功時に token_error を NULL にリセットし、トークンを更新）
      // NextAuth の PrismaAdapter は既存 Account に対して linkAccount を呼ばないため、
      // signIn コールバックで明示的にトークンを保存する必要がある。
      // 初回ログイン時は Account がまだ存在しないため P2025 (RecordNotFound) が発生するが、
      // try-catch で握りつぶしてサインインを継続する（初回は PrismaAdapter が linkAccount で保存する）
      if (account.provider === GOOGLE_PROVIDER && account.providerAccountId) {
        try {
          // refresh_token が返されなかった場合（Google が省略するケース）は既存値を維持する
          const tokenData = {
            token_error: null,
            access_token: account.access_token,
            expires_at: account.expires_at,
            token_type: account.token_type,
            ...(account.refresh_token && { refresh_token: account.refresh_token }),
          }

          await prisma.account.update({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            data: tokenData,
          })
        } catch (error) {
          // 初回ログイン時は Account が未存在のため P2025 が発生する（無視して継続）
          const isRecordNotFound =
            error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
          if (!isRecordNotFound) {
            // DB保存に失敗してもサインイン自体はブロックしない。
            // ただしトークンが古いままになるため、次のポーリングで再び token_error が発生する可能性がある。
            console.error('[auth] Failed to update account tokens', error)
          }
        }
      }

      return true
    },

    async jwt({ token, user, account }) {
      // サインイン時（account && user が存在する場合）のみ実行する。
      // この時点では Prisma Adapter による User/Account の永続化が完了しており、
      // user.id は DB の UUID となる。
      if (account && user) {
        token.userId = user.id
        token.accessToken = account.access_token

        // UserSetting を upsert する（初回ログイン時に作成、2回目以降は update: {} で何もしない）
        // account && user が存在するのはサインイン直後のみなので、毎回実行しても冪等で安全
        const existingUserSetting = await prisma.userSetting.findUnique({
          where: { userId: user.id },
        })

        await prisma.userSetting.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            userId: user.id,
            pollingIntervalMinutes: DEFAULT_POLLING_INTERVAL_MINUTES,
            contentRetentionDays: DEFAULT_CONTENT_RETENTION_DAYS,
          },
        })

        if (existingUserSetting === null) {
          console.info(`[auth] 初回ログイン: userId=${user.id}`)
          queue.add(
            SETUP_JOB_NAME,
            { userId: user.id },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              jobId: `${SETUP_JOB_NAME}-${user.id}`,
            },
          ).catch((err) => console.error('[auth] Failed to enqueue setup job', err))
        }
      }

      return token
    },

    async session({ session, token }) {
      // セッションにユーザーIDを含める
      if (token.userId && session.user) {
        session.user.id = token.userId as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}
