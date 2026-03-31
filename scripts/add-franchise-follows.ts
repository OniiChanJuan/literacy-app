/**
 * Creates the franchise_follows table directly via raw SQL.
 * Run with: npx tsx scripts/add-franchise-follows.ts
 */
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log("Creating franchise_follows table...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS franchise_follows (
      user_id    TEXT        NOT NULL,
      franchise_id INT       NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, franchise_id)
    );
    CREATE INDEX IF NOT EXISTS franchise_follows_user_id_idx      ON franchise_follows(user_id);
    CREATE INDEX IF NOT EXISTS franchise_follows_franchise_id_idx ON franchise_follows(franchise_id);
  `);

  console.log("Done.");
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
