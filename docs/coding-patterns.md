# コーディングパターン

本プロジェクトで確立済みの実装パターン。新規実装時はこれらに従うこと。

## 1. APIルートの構造

すべてのAPIルートは以下の順序で処理する:

```typescript
export async function GET(request: NextRequest) {
  // 1. 認証チェック（早期リターン）
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    // 2. リクエストバリデーション
    // 3. ビジネスロジック（Prismaクエリ等）
    // 4. レスポンスフォーマット
    return NextResponse.json(formatted)
  } catch (error) {
    // 5. エラーハンドリング（Prisma固有エラー → 汎用エラー）
    console.error('[route-name] METHOD error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
```

### 動的ルートのパラメータ型

```typescript
type RouteContext = {
  params: Promise<{ categoryId: string }>
}

export async function PATCH(_request: NextRequest, context: RouteContext) {
  const { categoryId } = await context.params
  // ...
}
```

- `params`は`Promise`（Next.js 14+ App Router仕様）
- 未使用パラメータはアンダースコアプレフィックス（`_request`）

## 2. レスポンスフォーマッタ

DBモデルとAPIレスポンスの変換は`helpers.ts`のフォーマット関数で行う。

```typescript
// src/app/api/{resource}/helpers.ts

export type CategoryWithNotificationSetting = Category & {
  notificationSetting: NotificationSetting | null
}

export function formatCategory(category: CategoryWithNotificationSetting): CategoryResponse {
  return {
    id: category.id,
    name: category.name,
    settings: category.notificationSetting
      ? formatNotificationSetting(category.notificationSetting)
      : null,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  }
}
```

**ルール:**
- 内部フィールド（`userId`等）をレスポンスに含めない
- 日付は`.toISOString()`でISO文字列に変換
- Prismaのinclude結果型は交差型（`Model & { relation: Type }`）で定義
- フォーマッタはルートファイルと同じディレクトリの`helpers.ts`に配置

## 3. エラーハンドリング

### エラーレスポンス

```typescript
// 通常エラー
return errorResponse(ErrorCode.NOT_FOUND, 'カテゴリが見つかりません', 404)

// バリデーションエラー（フィールド詳細付き）
return validationErrorResponse([
  { field: 'name', message: 'name は必須です' },
])

// クールダウンエラー（retryAfter付き）
return cooldownErrorResponse(remainingSeconds)
```

### Prismaエラーの処理

```typescript
catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return errorResponse(ErrorCode.CATEGORY_NAME_DUPLICATE, '同じ名前のカテゴリがすでに存在します', 409)
  }
  console.error('[categories] POST error:', error)
  return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
}
```

- 固有のPrismaエラーコード（`P2002`, `P2025`等）を先にチェック
- 汎用エラーは必ず`console.error`でログ出力してからレスポンス

### console.errorフォーマット

```
[route-name] METHOD error:
```

例: `[categories] POST error:`, `[watch-later] PUT error:`

## 4. ページネーション

keyset paginationパターン:

```typescript
// ルートハンドラ
const contents = await prisma.content.findMany({ ..., take: limit + 1 })
const meta = buildPaginationMeta(contents, limit)
const data = contents.slice(0, limit).map((c) => formatContent(c, userId))
return NextResponse.json({ data, meta })
```

- `limit + 1`件取得し、超過分があれば次ページありと判定
- カーソルはBase64エンコードされた`(sortKey, id)`タプル
- レスポンス形状: `{ data: T[], meta: { hasNext: boolean, nextCursor: string | null } }`

## 5. テストファイルの構造

### モックセットアップ

```typescript
import { type DeepMockProxy, mockReset } from 'vitest-mock-extended'
import type { PrismaClient } from '@prisma/client'

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

// 認証モック（実装を部分的に保持）
vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return { ...actual, getAuthenticatedSession: vi.fn() }
})
```

### テストの構成

```typescript
let prismaMock: MockPrisma

beforeEach(async () => {
  prismaMock = await getPrismaMock()
  mockReset(prismaMock)
  mockGetAuthenticatedSession.mockReset()
})

describe('GET /api/categories', () => {
  it('認証エラーで401を返す', async () => { ... })
  it('カテゴリ一覧を返す', async () => { ... })
})
```

### テストデータファクトリ

```typescript
function makeCategoryWithSetting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-1',
    userId: 'user-1',
    name: 'テストカテゴリ',
    notificationSetting: { /* defaults */ },
    ...overrides,
  }
}
```

- デフォルト値を持つファクトリ関数で、`overrides`スプレッドで上書き可能にする
- ファクトリはテストファイル内に定義（共有が必要になれば`src/tests/fixtures/`に移動）

### リクエストビルダー

```typescript
import { buildRequest } from '@/tests/helpers/request-helper'

const request = buildRequest('/api/categories', {
  method: 'POST',
  body: { name: 'テスト' },
  searchParams: { categoryId: 'cat-1' },
})
const response = await POST(request)
expect(response.status).toBe(201)
```

## 6. HTTPステータスコードの使い分け

| 操作 | 成功ステータス | レスポンス |
|------|---------------|-----------|
| 取得（GET） | 200 | `NextResponse.json(data)` |
| 作成（POST） | 201 | `NextResponse.json(data, { status: 201 })` |
| 更新（PATCH/PUT） | 200 | `NextResponse.json(data)` |
| 削除（DELETE） | 204 | `new NextResponse(null, { status: 204 })` |
