/**
 * Migration — connection-corpus schema (Step 1).
 *
 * Adds the curated/community separation + corpus tables:
 *   - enum curated_strength (tight|medium|attenuated)
 *   - connection_clusters        (225 canonical clusters)
 *   - connection_pending_titles  (titles not yet in catalog)
 *   - connection_recs            (graded recs; curated_strength PROTECTED here)
 *   - cross_connections          (+ cluster_id, position, updated_at,
 *                                 community_adjustment [inert community lane])
 *
 * quality_score is RETAINED (deprecated, reversible cutover) — never read into a grade.
 *
 * Transactional + idempotent (safe to re-run). Uses DIRECT_URL (DDL-capable).
 * Repo convention: scripts/migrate-*.ts using pg.Client.
 *
 * Run: npx tsx scripts/migrate-connection-corpus.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import { Client } from "pg";

const STMTS: { label: string; sql: string }[] = [
  {
    label: "enum curated_strength",
    sql: `DO $$ BEGIN
            CREATE TYPE curated_strength AS ENUM ('tight','medium','attenuated');
          EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  },
  {
    label: "table connection_clusters",
    sql: `CREATE TABLE IF NOT EXISTS connection_clusters (
            id           SERIAL PRIMARY KEY,
            slug         TEXT NOT NULL,
            label        TEXT NOT NULL,
            blurb        TEXT NOT NULL,
            spans        TEXT[] NOT NULL DEFAULT '{}',
            is_canonical BOOLEAN NOT NULL DEFAULT true,
            merged_from  TEXT[] NOT NULL DEFAULT '{}',
            created_by   TEXT NOT NULL DEFAULT 'import',
            created_at   TIMESTAMP(3) NOT NULL DEFAULT now(),
            updated_at   TIMESTAMP(3) NOT NULL DEFAULT now()
          );`,
  },
  {
    label: "uniq connection_clusters.slug",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS connection_clusters_slug_key ON connection_clusters(slug);`,
  },
  {
    label: "table connection_pending_titles",
    sql: `CREATE TABLE IF NOT EXISTS connection_pending_titles (
            id               SERIAL PRIMARY KEY,
            title_authored   TEXT NOT NULL,
            media_authored   TEXT NOT NULL,
            what_it_is       TEXT,
            normalized_key   TEXT NOT NULL,
            reason           TEXT NOT NULL DEFAULT 'not_in_catalog',
            resolved_item_id INTEGER,
            created_at       TIMESTAMP(3) NOT NULL DEFAULT now(),
            updated_at       TIMESTAMP(3) NOT NULL DEFAULT now()
          );`,
  },
  {
    label: "uniq connection_pending_titles(normalized_key, media_authored)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS connection_pending_titles_normalized_key_media_authored_key
          ON connection_pending_titles(normalized_key, media_authored);`,
  },
  {
    label: "idx connection_pending_titles.resolved_item_id",
    sql: `CREATE INDEX IF NOT EXISTS connection_pending_titles_resolved_item_id_idx
          ON connection_pending_titles(resolved_item_id);`,
  },
  {
    label: "fk connection_pending_titles.resolved_item_id -> items",
    sql: `DO $$ BEGIN
            ALTER TABLE connection_pending_titles
              ADD CONSTRAINT connection_pending_titles_resolved_item_id_fkey
              FOREIGN KEY (resolved_item_id) REFERENCES items(id) ON DELETE SET NULL;
          EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  },
  {
    label: "table connection_recs",
    sql: `CREATE TABLE IF NOT EXISTS connection_recs (
            id                 SERIAL PRIMARY KEY,
            connection_id      INTEGER NOT NULL,
            rec_item_id        INTEGER,
            pending_title_id   INTEGER,
            curated_strength   curated_strength NOT NULL,
            shared_threads     TEXT[] NOT NULL DEFAULT '{}',
            rec_media_authored TEXT,
            what_it_is         TEXT,
            position           INTEGER NOT NULL DEFAULT 0,
            created_by         TEXT NOT NULL DEFAULT 'import',
            created_at         TIMESTAMP(3) NOT NULL DEFAULT now(),
            updated_at         TIMESTAMP(3) NOT NULL DEFAULT now()
          );`,
  },
  {
    label: "uniq connection_recs(connection_id, rec_item_id)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS connection_recs_connection_id_rec_item_id_key
          ON connection_recs(connection_id, rec_item_id);`,
  },
  {
    label: "idx connection_recs.connection_id",
    sql: `CREATE INDEX IF NOT EXISTS connection_recs_connection_id_idx ON connection_recs(connection_id);`,
  },
  {
    label: "idx connection_recs.rec_item_id",
    sql: `CREATE INDEX IF NOT EXISTS connection_recs_rec_item_id_idx ON connection_recs(rec_item_id);`,
  },
  {
    label: "idx connection_recs.pending_title_id",
    sql: `CREATE INDEX IF NOT EXISTS connection_recs_pending_title_id_idx ON connection_recs(pending_title_id);`,
  },
  {
    label: "idx connection_recs.curated_strength",
    sql: `CREATE INDEX IF NOT EXISTS connection_recs_curated_strength_idx ON connection_recs(curated_strength);`,
  },
  {
    label: "fk connection_recs.connection_id -> cross_connections (cascade)",
    sql: `DO $$ BEGIN
            ALTER TABLE connection_recs
              ADD CONSTRAINT connection_recs_connection_id_fkey
              FOREIGN KEY (connection_id) REFERENCES cross_connections(id) ON DELETE CASCADE;
          EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  },
  {
    label: "fk connection_recs.rec_item_id -> items (set null)",
    sql: `DO $$ BEGIN
            ALTER TABLE connection_recs
              ADD CONSTRAINT connection_recs_rec_item_id_fkey
              FOREIGN KEY (rec_item_id) REFERENCES items(id) ON DELETE SET NULL;
          EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  },
  {
    label: "fk connection_recs.pending_title_id -> connection_pending_titles (set null)",
    sql: `DO $$ BEGIN
            ALTER TABLE connection_recs
              ADD CONSTRAINT connection_recs_pending_title_id_fkey
              FOREIGN KEY (pending_title_id) REFERENCES connection_pending_titles(id) ON DELETE SET NULL;
          EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  },
  // ── cross_connections: new columns ──
  { label: "cross_connections.cluster_id",           sql: `ALTER TABLE cross_connections ADD COLUMN IF NOT EXISTS cluster_id INTEGER;` },
  { label: "cross_connections.position",             sql: `ALTER TABLE cross_connections ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;` },
  { label: "cross_connections.updated_at",           sql: `ALTER TABLE cross_connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(3) NOT NULL DEFAULT now();` },
  { label: "cross_connections.community_adjustment", sql: `ALTER TABLE cross_connections ADD COLUMN IF NOT EXISTS community_adjustment DOUBLE PRECISION NOT NULL DEFAULT 0.0;` },
  {
    label: "idx cross_connections.cluster_id",
    sql: `CREATE INDEX IF NOT EXISTS cross_connections_cluster_id_idx ON cross_connections(cluster_id);`,
  },
  {
    label: "uniq cross_connections(source_item_id, cluster_id)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS cross_connections_source_item_id_cluster_id_key
          ON cross_connections(source_item_id, cluster_id);`,
  },
  {
    label: "fk cross_connections.cluster_id -> connection_clusters (set null)",
    sql: `DO $$ BEGIN
            ALTER TABLE cross_connections
              ADD CONSTRAINT cross_connections_cluster_id_fkey
              FOREIGN KEY (cluster_id) REFERENCES connection_clusters(id) ON DELETE SET NULL;
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
    for (const { label, sql } of STMTS) {
      await client.query(sql);
      console.log("  ✓", label);
    }
    await client.query("COMMIT");
    console.log("\nCOMMIT ok.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\nROLLBACK —", e);
    process.exitCode = 1;
    await client.end();
    return;
  }

  // ── verification ──
  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_name IN ('connection_clusters','connection_recs','connection_pending_titles') ORDER BY 1;`,
  );
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='cross_connections'
       AND column_name IN ('cluster_id','position','updated_at','community_adjustment','quality_score')
     ORDER BY 1;`,
  );
  const enumv = await client.query(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
     WHERE t.typname='curated_strength' ORDER BY e.enumsortorder;`,
  );
  console.log("\nVERIFY new tables:", tables.rows.map((r) => r.table_name).join(", "));
  console.log("VERIFY cross_connections cols:", cols.rows.map((r) => r.column_name).join(", "));
  console.log("VERIFY enum curated_strength:", enumv.rows.map((r) => r.enumlabel).join(", "));
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
