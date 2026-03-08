import { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset, DeepMockProxy } from "vitest-mock-extended";
import { beforeEach, vi } from "vitest";

// vi.hoisted() を使って vi.mock() のホイスティングより前に prismaMock を初期化する
export const prismaMock = vi.hoisted(() => mockDeep<PrismaClient>());

vi.mock("@/lib/db", () => ({
  default: prismaMock,
  prisma: prismaMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
});

export type PrismaMock = DeepMockProxy<PrismaClient>;
