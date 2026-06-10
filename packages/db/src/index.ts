// @repo/db — Prisma client + schema.
// Re-exports the generated Prisma client so downstream consumers
// (orchestrator, web) can `import { prisma } from '@repo/db'`.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export const DB_PACKAGE_VERSION = '0.1.0';

const connectionString = process.env['DATABASE_URL'] ?? 'postgresql://openoffice:openoffice@localhost:5432/openoffice';

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });
