-- AlterTable: Account に NextAuth が要求するフィールドを追加
ALTER TABLE "Account" ADD COLUMN "token_type" TEXT;
ALTER TABLE "Account" ADD COLUMN "id_token" TEXT;
ALTER TABLE "Account" ADD COLUMN "session_state" TEXT;

-- CreateTable: JWT strategy では使用しないが @auth/prisma-adapter の型要件を満たすため定義
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable: JWT strategy では使用しないが @auth/prisma-adapter の型要件を満たすため定義
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
