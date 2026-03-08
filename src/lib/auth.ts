import { PrismaAdapter } from '@auth/prisma-adapter'
import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

import { prisma } from '@/lib/db'

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
      // signIn コールバック実行時点では Prisma Adapter による Account の永続化が未完了の場合があるため、
      // 既存アカウントの存在を確認してから処理する（初回ログイン時は Account が存在しないためスキップ）
      if (account.provider === 'google' && account.providerAccountId) {
        const existingAccount = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
          select: { userId: true },
        })

        if (existingAccount) {
          await prisma.account.updateMany({
            where: {
              userId: existingAccount.userId,
              provider: 'google',
              providerAccountId: account.providerAccountId,
            },
            data: { token_error: null },
          })
        }
      }

      return true
    },

    async jwt({ token, user, account, isNewUser }) {
      // サインイン時（account が存在する場合）にアクセストークンとユーザーIDをJWTに含める
      // この時点では Prisma Adapter による User/Account の永続化が完了しており、
      // user.id は DB の UUID となる
      if (account && user) {
        token.userId = user.id
        token.accessToken = account.access_token
        token.isNewUser = isNewUser ?? false
      }

      // 初回ログイン時（isNewUser フラグが JWT に保存されている場合）に UserSetting を生成する
      // jwt コールバックはリクエストごとに呼ばれるため、一度処理したら isNewUser フラグを削除する
      if (token.isNewUser && token.userId) {
        // 初回ログイン判定: UserSetting の存在確認（upsert 前に行う）
        const existingUserSetting = await prisma.userSetting.findUnique({
          where: { userId: token.userId as string },
        })

        const isFirstLogin = existingUserSetting === null

        // UserSetting が存在しない場合はデフォルト値で upsert する
        // （database.md §4 の仕様: 初回ログイン時に自動生成）
        await prisma.userSetting.upsert({
          where: { userId: token.userId as string },
          update: {},
          create: {
            userId: token.userId as string,
            pollingIntervalMinutes: 30,
            contentRetentionDays: 60,
          },
        })

        if (isFirstLogin) {
          // T28 で BullMQ ジョブエンキューを実装するため、現時点はログ出力のみ
          console.log(`[auth] 初回ログイン: userId=${token.userId}`)
        }

        // 処理済みのフラグを削除して次回以降の jwt コールバックで再実行されないようにする
        token.isNewUser = false
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
