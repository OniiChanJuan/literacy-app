import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const users = await prisma.user.findMany({ select: { id: true, email: true, memberNumber: true, name: true } });
  console.log("users:", users);
  const ratings = await prisma.rating.count();
  const reviews = await prisma.review.count();
  const library = await prisma.libraryEntry.count();
  const signals = await prisma.implicitSignal.count();
  console.log({ ratings, reviews, library, signals });
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
