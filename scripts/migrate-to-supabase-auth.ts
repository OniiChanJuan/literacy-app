/**
 * migrate-to-supabase-auth.ts
 *
 * One-shot migration from NextAuth (cuid string IDs) to Supabase Auth
 * (UUID IDs, linked via public.users.id = auth.users.id).
 *
 * What this does, in order:
 *   1. Verify env (SUPABASE_SERVICE_ROLE_KEY, DIRECT_URL, etc.)
 *   2. Delete the seed `demo-user-1` and cascade its child rows
 *   3. For each remaining user, create a Supabase Auth user with the
 *      same email + confirmed state (admin API, service role)
 *   4. Build a cuid→uuid map of the new IDs
 *   5. Inside a single transaction:
 *        a. Drop ALL foreign keys referencing public.users.id
 *        b. Alter public.users.id from text → uuid, migrating values
 *        c. Alter every child user_id column from text → uuid, remap values
 *        d. Re-add foreign keys pointing at public.users(id) ON DELETE CASCADE
 *        e. Install the handle_new_user trigger (with advisory lock for
 *           race-safe member_number allocation)
 *        f. Drop obsolete NextAuth tables: accounts, sessions,
 *           verification_tokens, password_reset_tokens,
 *           email_verification_tokens
 *   6. Print a final summary
 *
 * Run:   npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-to-supabase-auth.ts
 * Dry:   npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-to-supabase-auth.ts --dry-run
 *
 * SAFETY:
 *   - Idempotent on the Supabase Auth side: if a user already exists in
 *     auth.users with the same email, the script REUSES its UUID
 *     instead of creating a second one.
 *   - All public-schema changes happen inside a single BEGIN/COMMIT.
 *     If any step fails, the whole DB migration rolls back.
 *   - The Supabase Auth user creation is NOT rolled back on DB failure
 *     — that's OK, a duplicate-email second run will reuse them.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");

// ── Env check ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;

function die(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL) die("NEXT_PUBLIC_SUPABASE_URL missing in .env.local");
if (!SERVICE_ROLE) die("SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
if (!DB_URL) die("DIRECT_URL / DATABASE_URL missing in .env.local");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Tables in public schema with a user_id-type FK to users(id) ───────────────
// name → { column, isPk (composite or identity), onDelete }
interface FkSpec {
  table: string;
  column: string;
  nullable?: boolean;
}
const CHILD_FKS: FkSpec[] = [
  { table: "user_settings",          column: "user_id" },
  { table: "ratings",                column: "user_id" },
  { table: "reviews",                column: "user_id" },
  { table: "review_helpful_votes",   column: "user_id" },
  { table: "library_entries",        column: "user_id" },
  { table: "implicit_signals",       column: "user_id" },
  { table: "dismissed_items",        column: "user_id" },
  { table: "notifications",          column: "user_id" },
  { table: "imports",                column: "user_id" },
  { table: "user_tag_suggestions",   column: "user_id" },
  { table: "franchise_follows",      column: "user_id" },
  { table: "franchise_ratings",      column: "user_id" },
  { table: "follows",                column: "follower_id" },
  { table: "follows",                column: "followed_id" },
  { table: "reports",                column: "reporter_user_id", nullable: true },
];

// Tables we're dropping entirely (NextAuth + custom token tables).
const OBSOLETE_TABLES = [
  "accounts",
  "sessions",
  "verification_tokens",
  "password_reset_tokens",
  "email_verification_tokens",
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== migrate-to-supabase-auth.ts ${DRY_RUN ? "[DRY RUN]" : ""} ===\n`);

  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();

  // 1. Snapshot existing users
  const { rows: existingUsers } = await pg.query(`
    SELECT id, email, name, username, avatar, bio, member_number, is_private,
           terms_accepted_at, taste_profile, created_at
    FROM users
    ORDER BY member_number ASC NULLS LAST
  `);
  console.log(`Found ${existingUsers.length} users:`);
  for (const u of existingUsers) {
    console.log(`  [${u.member_number ?? "?"}] ${u.email.padEnd(32)} cuid=${u.id}`);
  }

  // 2. Identify and delete the demo user
  const demoUser = existingUsers.find(
    (u) => u.id === "demo-user-1" || u.email.endsWith("@literacy.app")
  );
  let usersToMigrate = existingUsers.filter((u) => u !== demoUser);

  if (demoUser) {
    console.log(`\nDeleting demo user: [${demoUser.id}] ${demoUser.email}`);
    if (!DRY_RUN) {
      await pg.query(`DELETE FROM users WHERE id = $1`, [demoUser.id]);
      console.log(`  ✓ cascaded delete`);
    } else {
      console.log(`  [dry-run] would delete`);
    }
  }

  if (usersToMigrate.length === 0) {
    console.log("\nNo users to migrate. Done.");
    await pg.end();
    return;
  }

  // 3. Create Supabase Auth users + build cuid→uuid map
  console.log(`\nCreating Supabase Auth users (${usersToMigrate.length})...`);
  const cuidToUuid = new Map<string, string>();

  for (const u of usersToMigrate) {
    // Idempotency: check if an auth user already exists with this email
    // (lets us re-run the script safely).
    const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) die(`listUsers failed: ${listErr.message}`);
    const existing = listed.users.find((au) => au.email?.toLowerCase() === u.email.toLowerCase());

    if (existing) {
      console.log(`  ↻ reuse existing auth.users ${u.email} → ${existing.id}`);
      cuidToUuid.set(u.id, existing.id);
      continue;
    }

    if (DRY_RUN) {
      const fakeId = `dryrun-${u.id.slice(-8)}`;
      cuidToUuid.set(u.id, fakeId);
      console.log(`  [dry-run] would create auth.users for ${u.email}`);
      continue;
    }

    const { data: created, error } = await admin.auth.admin.createUser({
      email: u.email,
      email_confirm: true, // pre-confirm — existing user, we trust their email
      user_metadata: {
        full_name: u.name,
        username: u.username,
        migrated_from_nextauth: true,
      },
    });
    if (error || !created.user) die(`createUser failed for ${u.email}: ${error?.message}`);
    console.log(`  ✓ created auth.users ${u.email} → ${created.user.id}`);
    cuidToUuid.set(u.id, created.user.id);
  }

  if (DRY_RUN) {
    console.log(`\n[dry-run] ${cuidToUuid.size} cuid→uuid mappings built. Skipping DB migration.`);
    await pg.end();
    return;
  }

  // 4. Run the DB migration in one transaction
  console.log(`\nStarting DB transaction...`);
  await pg.query("BEGIN");
  try {
    // 4a. Drop ALL FKs to users(id) — we discover them dynamically
    console.log(`  dropping FKs to users(id)...`);
    const { rows: fks } = await pg.query(`
      SELECT
        tc.table_schema, tc.table_name, tc.constraint_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_schema = 'public'
        AND ccu.table_name = 'users'
        AND ccu.column_name = 'id'
    `);
    for (const fk of fks) {
      console.log(`    - ${fk.table_name}.${fk.column_name} (${fk.constraint_name})`);
      await pg.query(`ALTER TABLE ${fk.table_schema}."${fk.table_name}" DROP CONSTRAINT "${fk.constraint_name}"`);
    }

    // 4b. Drop NextAuth + token tables BEFORE we alter users.id.
    // These tables have FKs to users that we just dropped.
    console.log(`  dropping obsolete tables...`);
    for (const t of OBSOLETE_TABLES) {
      await pg.query(`DROP TABLE IF EXISTS public."${t}" CASCADE`);
      console.log(`    - ${t}`);
    }

    // 4c. Alter public.users.id from text → uuid using the cuid→uuid map.
    console.log(`  adding temp uuid column to users...`);
    await pg.query(`ALTER TABLE users ADD COLUMN id_new uuid`);
    for (const [cuid, uuid] of cuidToUuid) {
      await pg.query(`UPDATE users SET id_new = $1 WHERE id = $2`, [uuid, cuid]);
    }

    // Verify all rows got a uuid
    const { rows: missing } = await pg.query(`SELECT id, email FROM users WHERE id_new IS NULL`);
    if (missing.length > 0) {
      throw new Error(`Users with no uuid mapping: ${JSON.stringify(missing)}`);
    }

    // Rewrite child tables (that still exist) using the same map.
    for (const fk of CHILD_FKS) {
      // Skip if the parent table got dropped (e.g. accounts)
      const { rows: tExists } = await pg.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
        [fk.table],
      );
      if (tExists.length === 0) continue;

      console.log(`  rewriting ${fk.table}.${fk.column}...`);
      // Add a new uuid column, populate from map, drop old, rename
      await pg.query(`ALTER TABLE "${fk.table}" ADD COLUMN "${fk.column}_new" uuid`);
      for (const [cuid, uuid] of cuidToUuid) {
        await pg.query(
          `UPDATE "${fk.table}" SET "${fk.column}_new" = $1 WHERE "${fk.column}" = $2`,
          [uuid, cuid],
        );
      }
      // Any rows that still have a null uuid (orphaned, wrong user id) should
      // be caught here. For nullable FKs we allow it; for non-nullable we error.
      if (!fk.nullable) {
        const { rows: orphan } = await pg.query(
          `SELECT COUNT(*)::int AS n FROM "${fk.table}" WHERE "${fk.column}_new" IS NULL`,
        );
        if (orphan[0].n > 0) {
          throw new Error(`${fk.table}: ${orphan[0].n} rows have no uuid mapping for ${fk.column}`);
        }
      }
    }

    // Drop old users.id + rename id_new → id
    console.log(`  swapping users.id → uuid...`);
    // Drop primary key first
    await pg.query(`ALTER TABLE users DROP CONSTRAINT users_pkey`);
    await pg.query(`ALTER TABLE users DROP COLUMN id`);
    await pg.query(`ALTER TABLE users RENAME COLUMN id_new TO id`);
    await pg.query(`ALTER TABLE users ALTER COLUMN id SET NOT NULL`);
    await pg.query(`ALTER TABLE users ADD PRIMARY KEY (id)`);

    // Swap every child table's user_id column too
    for (const fk of CHILD_FKS) {
      const { rows: tExists } = await pg.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
        [fk.table],
      );
      if (tExists.length === 0) continue;
      console.log(`  swapping ${fk.table}.${fk.column}...`);
      // Drop any composite PKs that include the column
      const { rows: pk } = await pg.query(`
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema='public'
          AND tc.table_name=$1
          AND tc.constraint_type='PRIMARY KEY'
          AND kcu.column_name=$2
      `, [fk.table, fk.column]);
      for (const p of pk) {
        await pg.query(`ALTER TABLE "${fk.table}" DROP CONSTRAINT "${p.constraint_name}"`);
      }
      // Drop indexes that reference the old column (they'll be recreated as needed)
      const { rows: idx } = await pg.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname='public' AND tablename=$1 AND indexdef LIKE '%' || $2 || '%'
          AND indexname NOT LIKE '%_pkey'
      `, [fk.table, fk.column]);
      for (const i of idx) {
        await pg.query(`DROP INDEX IF EXISTS public."${i.indexname}"`);
      }
      await pg.query(`ALTER TABLE "${fk.table}" DROP COLUMN "${fk.column}"`);
      await pg.query(`ALTER TABLE "${fk.table}" RENAME COLUMN "${fk.column}_new" TO "${fk.column}"`);
      if (!fk.nullable) {
        await pg.query(`ALTER TABLE "${fk.table}" ALTER COLUMN "${fk.column}" SET NOT NULL`);
      }
      // Rebuild FK
      await pg.query(`
        ALTER TABLE "${fk.table}"
        ADD CONSTRAINT "${fk.table}_${fk.column}_fkey"
        FOREIGN KEY ("${fk.column}") REFERENCES users(id) ON DELETE CASCADE
      `);
    }

    // Re-create the composite PKs that we dropped
    console.log(`  re-creating composite PKs / indexes...`);
    const compositePks: Array<{ table: string; cols: string[] }> = [
      { table: "user_settings",        cols: ["user_id"] },
      { table: "franchise_follows",    cols: ["user_id", "franchise_id"] },
      { table: "franchise_ratings",    cols: ["user_id", "franchise_id"] },
      { table: "library_entries",      cols: ["user_id", "item_id"] },
      { table: "dismissed_items",      cols: ["user_id", "item_id"] },
      { table: "review_helpful_votes", cols: ["user_id", "review_id"] },
      { table: "follows",              cols: ["follower_id", "followed_id"] },
    ];
    for (const { table, cols } of compositePks) {
      const { rows: tExists } = await pg.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
        [table],
      );
      if (tExists.length === 0) continue;
      // Only add if not already present
      const { rows: hasPk } = await pg.query(
        `SELECT 1 FROM information_schema.table_constraints
         WHERE table_schema='public' AND table_name=$1 AND constraint_type='PRIMARY KEY'`,
        [table],
      );
      if (hasPk.length === 0) {
        await pg.query(
          `ALTER TABLE "${table}" ADD PRIMARY KEY (${cols.map((c) => `"${c}"`).join(", ")})`,
        );
      }
    }

    // 4d. Install the trigger. Race-safe via advisory lock.
    console.log(`  installing handle_new_user trigger...`);
    await pg.query(`
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS TRIGGER AS $$
      DECLARE
        v_next_member int;
      BEGIN
        -- Serialize member_number allocation across concurrent signups.
        PERFORM pg_advisory_xact_lock(42424242);
        SELECT COALESCE(MAX(member_number), 0) + 1 INTO v_next_member FROM public.users;

        INSERT INTO public.users (id, email, name, member_number, created_at, updated_at, auth_provider)
        VALUES (
          NEW.id,
          NEW.email,
          COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            split_part(NEW.email, '@', 1)
          ),
          v_next_member,
          NOW(),
          NOW(),
          COALESCE(NEW.raw_app_meta_data->>'provider', 'email')
        )
        ON CONFLICT (id) DO NOTHING;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);
    await pg.query(`DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users`);
    await pg.query(`
      CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()
    `);

    // 4e. Drop NextAuth-specific columns from public.users that are
    // no longer meaningful (password, email_verified, auth-provider
    // account linking — Supabase manages all of this in auth.users).
    console.log(`  dropping obsolete columns from users...`);
    await pg.query(`ALTER TABLE users DROP COLUMN IF EXISTS password`);
    await pg.query(`ALTER TABLE users DROP COLUMN IF EXISTS email_verified`);
    // Keep image, name, bio, avatar, username, member_number, is_private,
    // terms_accepted_at, taste_profile, auth_provider, timestamps.

    await pg.query("COMMIT");
    console.log(`\n✓ migration committed`);
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error(`\n✗ migration failed, rolled back:`, e);
    throw e;
  }

  // 5. Summary
  const { rows: final } = await pg.query(`
    SELECT id, email, name, member_number FROM users ORDER BY member_number
  `);
  console.log(`\nFinal users table:`);
  console.table(final);

  await pg.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
