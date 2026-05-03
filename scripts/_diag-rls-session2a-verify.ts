/**
 * Session 2a verification — confirms post-migration state matches the
 * intended pattern across all 15 in-scope tables, and flags any drift.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_diag-rls-session2a-verify.ts
 */
import "dotenv/config";
import { Client } from "pg";

const CATALOG = ["items", "external_scores", "franchises", "franchise_items", "tags"];
const OWNER_ONLY = ["user_settings", "dismissed_items", "implicit_signals", "imports", "notifications", "user_tag_suggestions"];
const SERVICE_ROLE_ONLY = ["reports", "dmca_notices", "platform_clicks", "suggested_connections"];

function listEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const A = [...a].sort();
  const B = [...b].sort();
  return A.every((x, i) => x === B[i]);
}

/**
 * pg_policies.roles is name[] which node-pg may surface as either a JS
 * array OR a Postgres array literal string like "{anon,authenticated}".
 * Coerce both into a plain string[] for stable comparison.
 */
function asRoleList(roles: unknown): string[] {
  if (Array.isArray(roles)) return roles.map(String);
  if (typeof roles === "string") {
    const trimmed = roles.replace(/^\{|\}$/g, "");
    if (!trimmed) return [];
    return trimmed.split(",").map((s) => s.trim());
  }
  return [];
}

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  let driftFound = false;
  const drift = (msg: string) => {
    driftFound = true;
    console.log(`  ⚠️  ${msg}`);
  };

  // Pull RLS + all policies for the 15 tables in one shot.
  const all = [...CATALOG, ...OWNER_ONLY, ...SERVICE_ROLE_ONLY];
  const { rows: rlsRows } = await pg.query(
    `SELECT tablename, rowsecurity FROM pg_tables
     WHERE schemaname='public' AND tablename = ANY($1::text[]);`,
    [all]
  );
  const rlsMap = new Map(rlsRows.map((r: any) => [r.tablename, r.rowsecurity]));

  const { rows: polRows } = await pg.query(
    `SELECT tablename, policyname, cmd, roles, qual, with_check
     FROM pg_policies
     WHERE schemaname='public' AND tablename = ANY($1::text[])
     ORDER BY tablename, policyname;`,
    [all]
  );
  const polByTable = new Map<string, any[]>();
  for (const t of all) polByTable.set(t, []);
  for (const r of polRows) polByTable.get(r.tablename)!.push(r);

  console.log("\n═══ CATALOG (5 tables, 1 SELECT policy each, anon+authenticated) ═══\n");
  for (const t of CATALOG) {
    const rls = rlsMap.get(t);
    const pols = polByTable.get(t)!;
    const expected = `${t}_public_read`;
    const roles = pols[0] ? asRoleList(pols[0].roles) : [];
    const ok = rls === true && pols.length === 1 && pols[0].policyname === expected
      && pols[0].cmd === "SELECT"
      && listEqual(roles, ["anon", "authenticated"]);
    console.log(`  ${ok ? "✅" : "❌"} ${t.padEnd(25)} rls=${rls} policies=${pols.length} (${pols.map(p => p.policyname).join(", ") || "none"})`);
    if (!ok) drift(`${t} catalog expectation not met`);
  }

  console.log("\n═══ OWNER-ONLY (6 tables, 4 policies each, authenticated only) ═══\n");
  for (const t of OWNER_ONLY) {
    const rls = rlsMap.get(t);
    const pols = polByTable.get(t)!;
    const expected = ["select", "insert", "update", "delete"].map(c => `${t}_owner_${c}`);
    const got = pols.map((p) => p.policyname);
    const allFour = expected.every((e) => got.includes(e));
    const allAuthenticated = pols.every((p) => {
      const roles = asRoleList(p.roles);
      return roles.length === 1 && roles[0] === "authenticated";
    });
    const ok = rls === true && pols.length === 4 && allFour && allAuthenticated;
    console.log(`  ${ok ? "✅" : "❌"} ${t.padEnd(25)} rls=${rls} policies=${pols.length}`);
    if (!ok) drift(`${t} owner-only expectation not met (got ${pols.length} policies, expected 4)`);
  }

  console.log("\n═══ SERVICE-ROLE-ONLY (4 tables, RLS on, ZERO policies) ═══\n");
  for (const t of SERVICE_ROLE_ONLY) {
    const rls = rlsMap.get(t);
    const pols = polByTable.get(t)!;
    const ok = rls === true && pols.length === 0;
    console.log(`  ${ok ? "✅" : "❌"} ${t.padEnd(25)} rls=${rls} policies=${pols.length}`);
    if (!ok) drift(`${t} service-role-only expectation not met (has ${pols.length} policies, expected 0)`);
  }

  // Confirm comments are set on the 4 service-role-only tables
  console.log("\n═══ COMMENTS on service-role-only tables ═══\n");
  const { rows: comments } = await pg.query(
    `
    SELECT c.relname AS tablename, obj_description(c.oid, 'pg_class') AS comment
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY($1::text[]);
    `,
    [SERVICE_ROLE_ONLY]
  );
  const commentMap = new Map(comments.map((r: any) => [r.tablename, r.comment]));
  for (const t of SERVICE_ROLE_ONLY) {
    const c = commentMap.get(t);
    const has = !!c && /Service-role-only/.test(c);
    console.log(`  ${has ? "✅" : "⚠️ "} ${t.padEnd(25)} ${has ? "comment set" : "NO comment"}`);
    if (!has) drift(`${t} missing service-role-only comment`);
  }

  console.log(`\n${driftFound ? "❌ DRIFT DETECTED — see warnings above" : "✅ No drift — all 15 tables match expected state"}\n`);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
