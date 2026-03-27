import { PrismaAdapter } from '@auth/prisma-adapter'
import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

import { DEFAULT_CONTENT_RETENTION_DAYS, DEFAULT_POLLING_INTERVAL_MINUTES, SETUP_JOB_NAME } from '@/lib/config'
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

      // 再認証時に token_error を NULL にリセットする
      // （youtube-auth.md §4 の仕様: 再認証成功時に token_error を NULL にリセット）
      // 初回ログイン時は Account がまだ存在しないため P2025 (RecordNotFound) が発生するが、
      // try-catch で握りつぶしてサインインを継続する
      if (account.provider === 'google' && account.providerAccountId) {
        try {
          await prisma.account.update({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            data: { token_error: null },
          })
        } catch {
          // 初回ログイン時は Account が未存在のため P2025 が発生する（無視して継続）
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
          // 初回ログイン: チャンネル同期ジョブをエンキュー
          console.info(`[auth] 初回ログイン: userId=${user.id}`)
          await queue.add(
            SETUP_JOB_NAME,
            { userId: user.id },
            {
              delay: 0,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              jobId: `${SETUP_JOB_NAME}:${user.id}`,
            },
          )
          console.info(`[auth] Setup job enqueued: userId=${user.id}`)
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
