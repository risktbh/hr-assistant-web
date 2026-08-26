import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL tidak ditemukan.',
  );
}

const globalForPrisma =
  globalThis as unknown as {
    prisma?: PrismaClient;
    pgPool?: Pool;
  };

const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString,
    max: 5,
  });

const adapter =
  new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (
  process.env.NODE_ENV !==
  'production'
) {
  globalForPrisma.prisma =
    prisma;

  globalForPrisma.pgPool =
    pool;
}