/**
 * Migration: create franchise_ratings table + enable RLS.
 * Run: npx tsx scripts/migrate-franchise-ratings.ts
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString: directUrl });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    console.log("Transaction started.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS franchise_ratings (
        user_id       TEXT        NOT NULL,
        franchise_id  INTEGER     NOT NULL REFERENCES franchises(id) ON DELETE CASCADE,
        rating        INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, franchise_id)
      )
    `);
    console.log("✓ Created franchise_ratings table");

    await client.query(`
      CREATE INDEX IF NOT EXISTS franchise_ratings_franchise_id_idx
      ON franchise_ratings (franchise_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS franchise_ratings_user_id_idx
      ON franchise_ratings (user_id)
    `);
    console.log("✓ Created indexes");

    await client.query(`ALTER TABLE franchise_ratings ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE franchise_ratings FORCE ROW LEVEL SECURITY`);
    console.log("✓ RLS enabled");

    await client.query("COMMIT");
    console.log("\nMigration complete.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Rolled back:", e);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
