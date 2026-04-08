import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const users: any[] = await prisma.$queryRawUnsafe(`SELECT id, email, name, member_number FROM users ORDER BY member_number`);
  console.log("USERS:", users);

  for (const u of users) {
    const r = await prisma.rating.count({ where: { userId: u.id } });
    const rv = await prisma.review.count({ where: { userId: u.id } });
    const lib = await prisma.libraryEntry.count({ where: { userId: u.id } });
    const sig = await prisma.implicitSignal.count({ where: { userId: u.id } });
    const tp = await prisma.user.findUnique({ where: { id: u.id }, select: { tasteProfile: true } });
    console.log(`[${u.member_number}] ${u.email} ratings=${r} reviews=${rv} library=${lib} signals=${sig} tasteProfile=${tp?.tasteProfile ? "set" : "null"}`);
  }

  // Check raw rating user_ids match users
  const orphaned: any[] = await prisma.$queryRawUnsafe(`
    SELECT r.user_id, COUNT(*)::int AS n FROM ratings r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE u.id IS NULL GROUP BY r.user_id
  `);
  console.log("ORPHANED ratings (user_id not in users):", orphaned);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
