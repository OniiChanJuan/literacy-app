/**
 * Session 2b baseline. Confirms the discovery report's findings still
 * hold against the live DB and surfaces any drift before migrations
 * touch anything.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_diag-rls-session2b-baseline.ts
 */
import "dotenv/config";
import { Client } from "pg";

const TABLES = [
  "ratings",
  "reviews",
  "review_helpful_votes",
  "follows",
  "franchise_follows",
  "franchise_ratings",
  "library_entries",
];

// Per-table list of columns that the migration relies on. If any of
// these are missing or wrong type, we stop and report.
const EXPECTED_COLS: Record<string, Array<{ name: string; type: string; nullable: "YES" | "NO" }>> = {
  ratings: [
    { name: "user_id", type: "uuid", nullable: "NO" },
    { name: "item_id", type: "integer", nullable: "NO" },
  ],
  reviews: [
    { name: "user_id", type: "uuid", nullable: "NO" },
  ],
  review_helpful_votes: [
    { name: "user_id", type: "uuid", nullable: "NO" },
    { name: "review_id", type: "integer", nullable: "NO" },
    { name: "vote_type", type: "character varying", nullable: "NO" },
  ],
  follows: [
    { name: "follower_id", type: "uuid", nullable: "NO" },
    { name: "followed_id", type: "uuid", nullable: "NO" },
  ],
  franchise_follows: [
    { name: "user_id", type: "uuid", nullable: "NO" },
    { name: "franchise_id", type: "integer", nullable: "NO" },
  ],
  franchise_ratings: [
    { name: "user_id", type: "uuid", nullable: "NO" },
    { name: "franchise_id", type: "integer", nullable: "NO" },
  ],
  library_entries: [
    { name: "user_id", type: "uuid", nullable: "NO" },
  ],
};

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  let drift = false;
  const flag = (msg: string) => { drift = true; console.log(`  ⚠️  ${msg}`); };

  console.log("\n=== RLS state + policy count + row count ===\n");
  for (const t of TABLES) {
    const { rows: rls } = await pg.query(
      `SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename=$1;`,
      [t]
    );
    const { rows: pol } = await pg.query(
      `SELECT COUNT(*)::int AS c FROM pg_policies WHERE schemaname='public' AND tablename=$1;`,
      [t]
    );
    const { rows: cnt } = await pg.query(`SELECT COUNT(*)::int AS c FROM public."${t}";`);
    const rlsOn = rls[0]?.rowsecurity === true;
    const polCount = pol[0].c;
    console.log(`  ${rlsOn ? "✅" : "❌"} ${t.padEnd(22)} rls=${rlsOn} policies=${polCount} rows=${cnt[0].c}`);
    if (!rlsOn) flag(`${t} has RLS DISABLED — discovery said it was enabled`);
    if (polCount !== 0) flag(`${t} already has ${polCount} policies — discovery said zero`);
  }

  console.log("\n=== Column shapes (must match expected) ===\n");
  for (const t of TABLES) {
    const expected = EXPECTED_COLS[t];
    const { rows: cols } = await pg.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1;`,
      [t]
    );
    const colMap = new Map(cols.map((c: any) => [c.column_name, c]));
    for (const e of expected) {
      const found: any = colMap.get(e.name);
      if (!found) {
        flag(`${t}.${e.name} MISSING`);
        continue;
      }
      const okType = found.data_type === e.type;
      const okNull = found.is_nullable === e.nullable;
      const status = okType && okNull ? "✅" : "❌";
      console.log(`  ${status} ${t}.${e.name.padEnd(15)} ${found.data_type.padEnd(20)} nullable=${found.is_nullable}`);
      if (!okType) flag(`${t}.${e.name} type ${found.data_type} ≠ expected ${e.type}`);
      if (!okNull) flag(`${t}.${e.name} nullable=${found.is_nullable} ≠ expected ${e.nullable}`);
    }
  }

  console.log("\n=== users.is_private column shape ===\n");
  const { rows: priv } = await pg.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='users' AND column_name='is_private';`
  );
  if (priv.length === 0) {
    flag("users.is_private MISSING");
  } else {
    const p: any = priv[0];
    const ok = p.data_type === "boolean" && p.is_nullable === "NO" && /false/i.test(p.column_default || "");
    console.log(`  ${ok ? "✅" : "❌"} users.is_private  ${p.data_type}  nullable=${p.is_nullable}  default=${p.column_default}`);
    if (!ok) flag(`users.is_private shape unexpected`);
  }

  // ── Orphaned library_entries check ─────────────────────────────────
  // is_user_private(uuid) returns false for unknown ids. That matches
  // the "library is visible to anon if owner not private" semantics
  // ONLY if every library_entries.user_id resolves to a real user row.
  // FK should make this impossible, but verify once.
  console.log("\n=== Orphaned library_entries (rows whose user_id has no users row) ===\n");
  const { rows: orphans } = await pg.query(`
    SELECT COUNT(*)::int AS c
    FROM public.library_entries le
    LEFT JOIN public.users u ON u.id = le.user_id
    WHERE u.id IS NULL;
  `);
  console.log(`  orphaned rows: ${orphans[0].c}`);
  if (orphans[0].c !== 0) flag(`${orphans[0].c} library_entries rows reference non-existent users — these would be PUBLICLY VISIBLE under the planned policy because is_user_private(unknown)=false`);

  // FK constraint check — confirms orphans should be impossible
  const { rows: fks } = await pg.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.library_entries'::regclass
      AND contype = 'f'
      AND confrelid = 'public.users'::regclass;
  `);
  console.log("\n  FK constraints library_entries → users:");
  if (fks.length === 0) console.log("    (none — orphans theoretically possible)");
  else for (const f of fks) console.log(`    ${f.conname}: ${f.def}`);

  // ── Existing is_user_private function (should not exist yet) ───────
  console.log("\n=== Existing is_user_private function (should be empty) ===\n");
  const { rows: fn } = await pg.query(`
    SELECT proname, prosecdef
    FROM pg_proc
    WHERE proname='is_user_private' AND pronamespace='public'::regnamespace;
  `);
  if (fn.length === 0) console.log("  (not present — good, will be created in Step 1)");
  else { console.log(`  ⚠️  already present:`); console.table(fn); }

  console.log(`\n${drift ? "❌ DRIFT — stop and report before running migrations." : "✅ Baseline matches discovery — safe to proceed."}\n`);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
