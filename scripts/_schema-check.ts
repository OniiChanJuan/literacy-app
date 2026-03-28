import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Check which columns actually exist in the items table
  const cols: any[] = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'items' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log('COLUMNS IN items TABLE:');
  for (const c of cols) console.log(`  ${c.column_name}: ${c.data_type}`);

  await prisma.$disconnect();
}
main().catch(console.error);
