import { Prisma, PrismaClient } from "@prisma/client";

// クエリログのパラメータからマスクすべき機密値のパターン
const SENSITIVE_PATTERNS = [
  /^ya29\./,          // Google access_token
  /^1\/\//,           // Google refresh_token
  /^eyJ[A-Za-z0-9]/,  // JWT (id_token)
];

function maskParams(paramsString: string): string {
  try {
    const params: unknown[] = JSON.parse(paramsString);
    const masked = params.map((p) => {
      if (typeof p === "string" && SENSITIVE_PATTERNS.some((re) => re.test(p))) {
        return "[REDACTED]";
      }
      return p;
    });
    return JSON.stringify(masked);
  } catch {
    return "[unparseable]";
  }
}

// Next.js のホットリロード時に PrismaClient インスタンスが複数生成されるのを防ぐための globalThis キャッシュ
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const isDev = process.env.NODE_ENV === "development";

  const client = new PrismaClient({
    log: isDev
      ? [
          { emit: "event", level: "query" },
          { emit: "stdout", level: "error" },
          { emit: "stdout", level: "warn" },
        ]
      : [{ emit: "stdout", level: "error" }],
  });

  if (isDev) {
    // PrismaClient の型パラメータにログ設定が反映されないため型キャストが必要
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).$on("query", (e: Prisma.QueryEvent) => {
      console.log(`prisma:query ${e.query}`);
      console.log(`prisma:params ${maskParams(e.params)}`);
      console.log(`prisma:duration ${e.duration}ms`);
    });
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
