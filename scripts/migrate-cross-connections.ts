/**
 * Creates the cross_connections + cross_connection_votes tables.
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-cross-connections.ts
 * Idempotent — uses IF NOT EXISTS everywhere.
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("Creating cross_connections...");
  await pg.query(`
    CREATE TABLE IF NOT EXISTS cross_connections (
      id SERIAL PRIMARY KEY,
      source_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      recommended_items JSONB NOT NULL,
      reason TEXT NOT NULL,
      theme_tags TEXT[] DEFAULT '{}',
      created_by TEXT DEFAULT 'editorial',
      quality_score DOUBLE PRECISION DEFAULT 1.0,
      created_at TIMESTAMP(3) DEFAULT NOW()
    );
  `);
  await pg.query(`CREATE INDEX IF NOT EXISTS cross_connections_source_item_id_idx ON cross_connections(source_item_id);`);
  await pg.query(`CREATE INDEX IF NOT EXISTS cross_connections_quality_score_idx ON cross_connections(quality_score);`);

  console.log("Creating cross_connection_votes...");
  await pg.query(`
    CREATE TABLE IF NOT EXISTS cross_connection_votes (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connection_id INTEGER NOT NULL REFERENCES cross_connections(id) ON DELETE CASCADE,
      vote INTEGER NOT NULL,
      created_at TIMESTAMP(3) DEFAULT NOW(),
      PRIMARY KEY (user_id, connection_id)
    );
  `);
  await pg.query(`CREATE INDEX IF NOT EXISTS cross_connection_votes_connection_id_idx ON cross_connection_votes(connection_id);`);

  const counts = await pg.query(`
    SELECT
      (SELECT COUNT(*)::int FROM cross_connections) AS connections,
      (SELECT COUNT(*)::int FROM cross_connection_votes) AS votes
  `);
  console.log("Row counts:", counts.rows[0]);
  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
