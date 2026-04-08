import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const users: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, email, username, name, member_number, auth_provider,
           email_verified IS NOT NULL AS email_verified,
           password IS NOT NULL AS has_password,
           created_at
    FROM users
    ORDER BY member_number ASC NULLS LAST
  `);
  console.log(JSON.stringify(users, null, 2));

  // Count rows in each user-referencing table
  const tables = [
    "user_settings", "accounts", "sessions",
    "franchise_follows", "franchise_ratings",
    "ratings", "reviews", "review_helpful_votes",
    "library_entries", "implicit_signals", "dismissed_items",
    "notifications", "follows", "imports",
    "user_tag_suggestions", "password_reset_tokens", "email_verification_tokens",
    "reports"
  ];
  console.log("\nRow counts per table:");
  for (const t of tables) {
    try {
      const r: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM ${t}`);
      console.log(`  ${t.padEnd(30)} ${r[0].n}`);
    } catch (e: any) {
      console.log(`  ${t.padEnd(30)} MISSING (${e.message.split("\n")[0]})`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
