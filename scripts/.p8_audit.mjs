import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../packages/db/src/generated/client.js';
const url = process.env.DATABASE_URL;
if (!url) { console.error('no DATABASE_URL'); process.exit(1); }
const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

const users = await prisma.user.findMany({
  where: { email: { contains: 'phase' } },
  include: { ownedOffices: { include: { tasks: { include: { events: true } } } } },
});
console.log('phase-tagged users:', users.length);
for (const u of users) {
  console.log(`  ${u.email}`);
  for (const o of u.ownedOffices) {
    console.log(`    office: ${o.name}  status=${o.status}`);
    for (const t of o.tasks) {
      console.log(`      task: ${t.id.slice(0,8)}  status=${t.status}  events=${t.events.length}`);
    }
  }
}
await prisma.$disconnect();
