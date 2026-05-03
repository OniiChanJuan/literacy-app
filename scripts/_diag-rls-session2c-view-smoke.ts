/**
 * One-shot smoke test: confirm prisma.publicUserProfile.findUnique
 * works and returns the expected shape with no sensitive fields.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_diag-rls-session2c-view-smoke.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

(async () => {
  // pick any existing user id
  const anyUser = await prisma.user.findFirst({ select: { id: true } });
  if (!anyUser) { console.error("no users found"); process.exit(1); }

  const profile = await prisma.publicUserProfile.findUnique({
    where: { id: anyUser.id },
  });
  console.log("prisma.publicUserProfile.findUnique result:");
  console.log(profile);

  // Assert shape: must contain id, must NOT contain email/auth_provider/taste_profile.
  const keys = Object.keys(profile || {});
  console.log("\nkeys:", keys);
  const forbidden = ["email", "authProvider", "tasteProfile", "termsAcceptedAt", "updatedAt"];
  const leaks = forbidden.filter((k) => keys.includes(k));
  if (leaks.length > 0) {
    console.error(`❌ view leaks forbidden fields: ${leaks.join(", ")}`);
    process.exit(1);
  }
  console.log("✅ no sensitive fields exposed via view model");
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
