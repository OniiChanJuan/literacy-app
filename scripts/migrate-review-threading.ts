/**
 * Manual migration: add threading + voting columns to reviews and review_helpful_votes tables.
 * Run: npx tsx scripts/migrate-review-threading.ts
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString: directUrl });

  console.log("Connecting to database...");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    console.log("Transaction started.");

    // 1. Add parent_id column (nullable self-ref FK)
    await client.query(`
      ALTER TABLE reviews
      ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES reviews(id) ON DELETE CASCADE
    `);
    console.log("✓ Added parent_id column");

    // 2. Add depth column
    await client.query(`
      ALTER TABLE reviews
      ADD COLUMN IF NOT EXISTS depth INTEGER NOT NULL DEFAULT 0
    `);
    console.log("✓ Added depth column");

    // 3. Add vote_score column
    await client.query(`
      ALTER TABLE reviews
      ADD COLUMN IF NOT EXISTS vote_score INTEGER NOT NULL DEFAULT 0
    `);
    console.log("✓ Added vote_score column");

    // 4. Add updated_at column if missing
    await client.query(`
      ALTER TABLE reviews
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    `);
    console.log("✓ Ensured updated_at column");

    // 5. Drop the unique constraint on (user_id, item_id) — replies allow multiple rows per user+item
    // First check if it exists
    const ucResult = await client.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'reviews'
        AND constraint_type = 'UNIQUE'
        AND constraint_name IN ('reviews_user_id_item_id_key', 'reviews_userId_itemId_key')
    `);

    for (const row of ucResult.rows) {
      await client.query(`ALTER TABLE reviews DROP CONSTRAINT IF EXISTS "${row.constraint_name}"`);
      console.log(`✓ Dropped unique constraint: ${row.constraint_name}`);
    }

    // Also try to drop by common Prisma-generated names
    await client.query(`ALTER TABLE reviews DROP CONSTRAINT IF EXISTS "reviews_user_id_item_id_key"`);
    await client.query(`ALTER TABLE reviews DROP CONSTRAINT IF EXISTS "reviews_userId_itemId_key"`);
    console.log("✓ Unique constraint removal attempted");

    // 6. Add index on parent_id
    await client.query(`
      CREATE INDEX IF NOT EXISTS "reviews_parent_id_idx" ON reviews(parent_id)
    `);
    console.log("✓ Added index on parent_id");

    // 7. Add composite indexes for efficient queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS "reviews_item_id_vote_score_created_at_idx"
      ON reviews(item_id, vote_score DESC, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "reviews_item_id_created_at_idx"
      ON reviews(item_id, created_at DESC)
    `);
    console.log("✓ Added composite indexes");

    // 8. Add vote_type column to review_helpful_votes
    await client.query(`
      ALTER TABLE review_helpful_votes
      ADD COLUMN IF NOT EXISTS vote_type VARCHAR(4) NOT NULL DEFAULT 'up'
    `);
    console.log("✓ Added vote_type column to review_helpful_votes");

    await client.query("COMMIT");
    console.log("\n✅ Migration completed successfully!");

    // Verify
    const colResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'reviews'
      ORDER BY ordinal_position
    `);
    console.log("\nReviews table columns:");
    for (const row of colResult.rows) {
      console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default})`);
    }

    const voteColResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'review_helpful_votes'
      ORDER BY ordinal_position
    `);
    console.log("\nReview_helpful_votes columns:");
    for (const row of voteColResult.rows) {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    }

  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed, rolled back:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
