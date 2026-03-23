import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Import item data — use relative path since this runs outside Next.js
const dataPath = "../src/lib/data";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Dynamically import the data module
  const { ITEMS, UPCOMING } = await import(dataPath);

  // 1. Create demo user
  await prisma.user.upsert({
    where: { id: "demo-user-1" },
    update: {},
    create: {
      id: "demo-user-1",
      email: "demo@literacy.app",
      name: "Demo User",
      bio: "A Literacy enthusiast exploring all media.",
      avatar: "",
      authProvider: "email",
      isPrivate: false,
    },
  });
  console.log("✓ Demo user created");

  // 2. Seed regular items
  for (const item of ITEMS) {
    await prisma.item.upsert({
      where: { id: item.id },
      update: {
        title: item.title,
        type: item.type,
        genre: item.genre,
        vibes: item.vibes,
        year: item.year,
        cover: item.cover,
        description: item.desc,
        people: item.people,
        awards: item.awards,
        platforms: item.platforms,
        ext: item.ext,
        totalEp: item.totalEp,
        isUpcoming: false,
      },
      create: {
        id: item.id,
        title: item.title,
        type: item.type,
        genre: item.genre,
        vibes: item.vibes,
        year: item.year,
        cover: item.cover,
        description: item.desc,
        people: item.people,
        awards: item.awards,
        platforms: item.platforms,
        ext: item.ext,
        totalEp: item.totalEp,
        isUpcoming: false,
      },
    });
  }
  console.log(`✓ ${ITEMS.length} regular items seeded`);

  // 3. Seed upcoming items
  for (const item of UPCOMING) {
    await prisma.item.upsert({
      where: { id: item.id },
      update: {
        title: item.title,
        type: item.type,
        genre: item.genre,
        vibes: item.vibes,
        year: item.year,
        cover: item.cover,
        description: item.desc,
        people: item.people,
        awards: item.awards,
        platforms: item.platforms,
        ext: item.ext,
        totalEp: item.totalEp,
        isUpcoming: true,
        releaseDate: item.releaseDate,
        hypeScore: item.hypeScore,
        wantCount: item.wantCount,
      },
      create: {
        id: item.id,
        title: item.title,
        type: item.type,
        genre: item.genre,
        vibes: item.vibes,
        year: item.year,
        cover: item.cover,
        description: item.desc,
        people: item.people,
        awards: item.awards,
        platforms: item.platforms,
        ext: item.ext,
        totalEp: item.totalEp,
        isUpcoming: true,
        releaseDate: item.releaseDate,
        hypeScore: item.hypeScore,
        wantCount: item.wantCount,
      },
    });
  }
  console.log(`✓ ${UPCOMING.length} upcoming items seeded`);

  await prisma.$disconnect();
  console.log("✓ Seed complete!");
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
