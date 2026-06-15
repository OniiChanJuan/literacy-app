/**
 * Migration — connection_rec_votes (per-rec vote capture lane).
 *
 * Option B: mobile's per-rec thumbs record here, keyed (user_id, connection_rec_id)
 * → connection_recs.id. Desktop's per-connection cross_connection_votes is untouched.
 * CAPTURE-ONLY: never mutates curated_strength.
 *
 * Idempotent + transactional (DIRECT_URL). Run: npx tsx scripts/migrate-connection-rec-votes.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import { Client } from "pg";

const STMTS: { label: string; sql: string }[] = [
  {
    label: "table connection_rec_votes",
    sql: `CREATE TABLE IF NOT EXISTS connection_rec_votes (
            user_id            UUID NOT NULL,
            connection_rec_id  INTEGER NOT NULL,
            vote               INTEGER NOT NULL,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, connection_rec_id)
          );`,
  },
  {
    label: "idx connection_rec_votes.connection_rec_id",
    sql: `CREATE INDEX IF NOT EXISTS connection_rec_votes_connection_rec_id_idx
          ON connection_rec_votes(connection_rec_id);`,
  },
  {
    label: "fk connection_rec_votes.connection_rec_id -> connection_recs (cascade)",
    sql: `DO $$ BEGIN
            ALTER TABLE connection_rec_votes
              ADD CONSTRAINT connection_rec_votes_connection_rec_id_fkey
              FOREIGN KEY (connection_rec_id) REFERENCES connection_recs(id) ON DELETE CASCADE;
          EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  },
  {
    label: "fk connection_rec_votes.user_id -> users (cascade)",
    sql: `DO $$ BEGIN
            ALTER TABLE connection_rec_votes
              ADD CONSTRAINT connection_rec_votes_user_id_fkey
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  },
];

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("No DIRECT_URL/DATABASE_URL");
  const client = new Client({ connectionString: url });
  await client.connect();
  console.log(`Connected to ${url.split("@")[1]?.split("/")[0]}`);
  try {
    await client.query("BEGIN");
    for (const { label, sql } of STMTS) { await client.query(sql); console.log("  ✓", label); }
    await client.query("COMMIT");
    console.log("\nCOMMIT ok.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\nROLLBACK —", e);
    process.exitCode = 1; await client.end(); return;
  }
  const t = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_name='connection_rec_votes';`);
  console.log("VERIFY table:", t.rows.map((r) => r.table_name).join(", ") || "(missing!)");
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
