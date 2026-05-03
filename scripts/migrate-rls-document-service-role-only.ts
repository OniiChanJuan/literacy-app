/**
 * migrate-rls-document-service-role-only.ts (Session 2a — service-role-only)
 *
 * These tables already have RLS enabled with no policies, so anon and
 * authenticated roles get nothing — that's the desired state. No schema
 * change needed.
 *
 * What this migration DOES:
 *   - Sets a COMMENT ON TABLE explaining that the absence of policies
 *     is intentional, citing this audit, so a future "the linter is
 *     yelling about no policies, let me just add one" mistake doesn't
 *     accidentally open these up.
 *
 * Tables:
 *   reports                — moderation queue. Reporters insert via
 *                            Prisma; admins read via Prisma. Exposing
 *                            this via PostgREST would leak who reported
 *                            whom.
 *   dmca_notices           — legal-compliance table; no app code reads
 *                            or writes today, but if/when we add a
 *                            DMCA submission form it will be Prisma-
 *                            only on the server.
 *   platform_clicks        — pure write-only telemetry from the redirect
 *                            endpoint. Nothing user-facing should be
 *                            able to read this.
 *   suggested_connections  — admin moderation queue for proposed
 *                            franchise/cross connections. Admin-only.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-rls-document-service-role-only.ts
 *
 * Idempotent (COMMENT ON TABLE is replace-on-write).
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   For each table: COMMENT ON TABLE public."<table>" IS NULL;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

const TABLES_AND_COMMENTS: Array<[string, string]> = [
  [
    "reports",
    "Service-role-only. RLS enabled with no user-facing policies. Reads + writes go through the Prisma superuser pooler connection. Exposing this via PostgREST would leak who reported whom. See security audit Session 2a (2026).",
  ],
  [
    "dmca_notices",
    "Service-role-only. RLS enabled with no user-facing policies. No app-side reads or writes today — table exists for future legal-compliance workflow which will be Prisma-only on the server. See security audit Session 2a (2026).",
  ],
  [
    "platform_clicks",
    "Service-role-only telemetry. Inserted via raw SQL by /api/go/[itemId]/[platform] over the Prisma superuser path; never read by user-facing code. Not exposed via PostgREST. See security audit Session 2a (2026).",
  ],
  [
    "suggested_connections",
    "Service-role-only admin moderation queue (proposed franchise / cross-media connections awaiting curator review). All access via Prisma superuser from /api/admin/suggestions. See security audit Session 2a (2026).",
  ],
];

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Documenting service-role-only intent on 4 tables ===\n");

  await pg.query("BEGIN");
  try {
    for (const [t, c] of TABLES_AND_COMMENTS) {
      console.log(`  COMMENT ON TABLE public."${t}"`);
      // pg_query parameter substitution doesn't apply inside DDL strings;
      // we escape single quotes manually for the COMMENT body.
      const escaped = c.replace(/'/g, "''");
      await pg.query(`COMMENT ON TABLE public."${t}" IS '${escaped}';`);
    }
    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  // Echo final state — confirm comments are set + zero policies present.
  const tableNames = TABLES_AND_COMMENTS.map(([t]) => t);
  const { rows: comments } = await pg.query(
    `
    SELECT c.relname AS tablename, obj_description(c.oid, 'pg_class') AS comment
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    ORDER BY c.relname;
    `,
    [tableNames]
  );
  console.log("Comments now set:");
  for (const r of comments) {
    console.log(`  ${r.tablename}: ${r.comment.slice(0, 80)}…`);
  }

  const { rows: policies } = await pg.query(
    `
    SELECT tablename, COUNT(*)::int AS policy_count
    FROM pg_policies
    WHERE schemaname='public' AND tablename = ANY($1::text[])
    GROUP BY tablename
    ORDER BY tablename;
    `,
    [tableNames]
  );
  console.log("\nPolicy counts (should be 0 for all):");
  if (policies.length === 0) {
    for (const t of tableNames) console.log(`  ${t}: 0`);
  } else {
    console.table(policies);
  }

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
