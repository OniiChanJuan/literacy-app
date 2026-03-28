import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  await prisma.$executeRawUnsafe(`ALTER TABLE items ADD COLUMN IF NOT EXISTS steam_app_id integer`);
  console.log('✅ steam_app_id column added (or already existed)');

  // Verify
  const cols: any[] = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'items' AND column_name = 'steam_app_id'
  `);
  console.log(cols.length > 0 ? '✅ Verified: steam_app_id exists in DB' : '❌ Column still missing!');

  await prisma.$disconnect();
}
main().catch(console.error);
