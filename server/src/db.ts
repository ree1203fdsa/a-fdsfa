import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from './generated/prisma/client.ts'

const url = process.env.DATABASE_URL ?? 'file:./data/colorwars.db'

export const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
