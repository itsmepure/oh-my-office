// Test PrismaClient with adapter
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../packages/db/generated/client.js';

const adapter = new PrismaBetterSqlite3({ url: 'file:dev.db' });
const prisma = new PrismaClient({ adapter });

try {
  // Try a simple query
  const result = await prisma.$queryRaw`SELECT 1 as test`;
  console.log('Connection OK:', result);
  
  // Try creating a user
  const user = await prisma.user.create({
    data: { email: 'test@test.com', name: 'Test', passwordHash: 'hash' }
  });
  console.log('Created user:', user.id);
  
  const users = await prisma.user.findMany();
  console.log('Users:', users.length);
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await prisma.$disconnect();
}
