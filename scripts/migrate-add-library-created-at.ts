/**
 * migrate-add-library-created-at.ts (Phase 4b — Library mobile sort)
 *
 * Adds a created_at timestamp to library_entries so the Library page can
 * offer a "Recent" sort (latest tracked activity first). The table never
 * had a creation/update timestamp — only nullable started_at/completed_at,
 * which are absent for Want-To items and not returned by /api/library.
 *
 *   ALTER TABLE library_entries
 *     ADD COLUMN created_at timestamp(3) NOT NULL DEFAULT now();
 *
 * Matches the Prisma model field:
 *   createdAt DateTime @default(now()) @map("created_at")
 *
 * Backfill behaviour (accepted in Phase 4a sign-off):
 *   - Existing rows receive now() at ALTER time (single clustered value).
 *     The pre-existing backlog therefore sorts as one undifferentiated
 *     block under "Recent" until new activity accrues — self-correcting,
 *     invisible to new users.
 *   - DEFAULT now() stays on the column, so EVERY future insert is
 *     auto-timestamped — not just this one-time backfill.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-add-library-created-at.ts
 *
 * Idempotent (ADD COLUMN IF NOT EXISTS).
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   ALTER TABLE library_entries DROP COLUMN IF EXISTS created_at;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Adding library_entries.created_at ===\n");

  await pg.query("BEGIN");
  try {
    await pg.query(`
      ALTER TABLE public.library_entries
        ADD COLUMN IF NOT EXISTS created_at timestamp(3) NOT NULL DEFAULT now();
    `);
    await pg.query("COMMIT");
    console.log("✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  const { rows } = await pg.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'library_entries'
      AND column_name = 'created_at';
  `);
  console.log("Column state:");
  console.table(rows);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
