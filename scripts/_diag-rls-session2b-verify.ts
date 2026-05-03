/**
 * Session 2b verification — confirms post-migration state matches
 * the intended pattern across all 7 tables + the helper function.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_diag-rls-session2b-verify.ts
 */
import "dotenv/config";
import { Client } from "pg";

const PUBLIC_OWNER_TABLES: Array<[string, string]> = [
  ["ratings", "user_id"],
  ["reviews", "user_id"],
  ["review_helpful_votes", "user_id"],
  ["franchise_ratings", "user_id"],
  ["franchise_follows", "user_id"],
  ["follows", "follower_id"],
];

function listEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const A = [...a].sort();
  const B = [...b].sort();
  return A.every((x, i) => x === B[i]);
}

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

  let drift = false;
  const flag = (msg: string) => { drift = true; console.log(`  ⚠️  ${msg}`); };

  // ── Public-read-owner-write tables (6) ─────────────────────────────
  console.log("\n═══ PUBLIC-READ + OWNER-WRITE (6 tables, 4 policies each) ═══\n");
  for (const [t, owner] of PUBLIC_OWNER_TABLES) {
    const { rows: rls } = await pg.query(
      `SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename=$1;`,
      [t]
    );
    const { rows: pols } = await pg.query(
      `SELECT policyname, cmd, roles, qual, with_check
       FROM pg_policies WHERE schemaname='public' AND tablename=$1
       ORDER BY policyname;`,
      [t]
    );

    const rlsOn = rls[0]?.rowsecurity === true;
    const expected = {
      [`${t}_public_read`]: { cmd: "SELECT", roles: ["anon", "authenticated"] },
      [`${t}_owner_insert`]: { cmd: "INSERT", roles: ["authenticated"] },
      [`${t}_owner_update`]: { cmd: "UPDATE", roles: ["authenticated"] },
      [`${t}_owner_delete`]: { cmd: "DELETE", roles: ["authenticated"] },
    };

    const allOk = rlsOn && pols.length === 4 && Object.entries(expected).every(([name, e]) => {
      const p: any = pols.find((x: any) => x.policyname === name);
      if (!p) return false;
      if (p.cmd !== e.cmd) return false;
      if (!listEqual(asRoleList(p.roles), e.roles)) return false;
      // Sanity: policy qual/with_check should reference the owner column.
      const text = `${p.qual ?? ""} ${p.with_check ?? ""}`;
      if (e.cmd !== "SELECT" && !text.includes(owner)) return false;
      return true;
    });

    console.log(`  ${allOk ? "✅" : "❌"} ${t.padEnd(22)} rls=${rlsOn} policies=${pols.length} (owner=${owner})`);
    if (!allOk) {
      flag(`${t} policy set does not match expected pattern`);
      console.table(pols);
    }
  }

  // ── library_entries ────────────────────────────────────────────────
  console.log("\n═══ LIBRARY_ENTRIES (privacy-aware SELECT) ═══\n");
  {
    const { rows: rls } = await pg.query(
      `SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='library_entries';`
    );
    const { rows: pols } = await pg.query(
      `SELECT policyname, cmd, roles, qual, with_check
       FROM pg_policies WHERE schemaname='public' AND tablename='library_entries'
       ORDER BY policyname;`
    );
    const rlsOn = rls[0]?.rowsecurity === true;

    const expected = {
      "library_entries_visible_to_owner_or_public": { cmd: "SELECT", roles: ["anon", "authenticated"] },
      "library_entries_owner_insert": { cmd: "INSERT", roles: ["authenticated"] },
      "library_entries_owner_update": { cmd: "UPDATE", roles: ["authenticated"] },
      "library_entries_owner_delete": { cmd: "DELETE", roles: ["authenticated"] },
    } as const;

    const sel: any = pols.find((p: any) => p.policyname === "library_entries_visible_to_owner_or_public");
    const selRefsHelper = !!sel?.qual && /is_user_private/.test(sel.qual);
    const allOk = rlsOn && pols.length === 4
      && Object.entries(expected).every(([name, e]) => {
        const p: any = pols.find((x: any) => x.policyname === name);
        return p && p.cmd === e.cmd && listEqual(asRoleList(p.roles), e.roles as unknown as string[]);
      })
      && selRefsHelper;

    console.log(`  ${allOk ? "✅" : "❌"} library_entries  rls=${rlsOn} policies=${pols.length}  SELECT-uses-helper=${selRefsHelper}`);
    if (!allOk) {
      flag("library_entries policy set does not match expected pattern");
      console.table(pols);
    } else {
      console.log(`  SELECT.qual: ${sel.qual}`);
    }
  }

  // ── Helper function ────────────────────────────────────────────────
  console.log("\n═══ HELPER FUNCTION public.is_user_private(uuid) ═══\n");
  {
    const { rows: fn } = await pg.query(`
      SELECT proname, prosecdef, proconfig, provolatile
      FROM pg_proc
      WHERE proname='is_user_private' AND pronamespace='public'::regnamespace;
    `);
    if (fn.length === 0) {
      flag("is_user_private function MISSING");
    } else {
      const f: any = fn[0];
      const okSecdef = f.prosecdef === true;
      const okStable = f.provolatile === "s";
      const cfg: string[] = f.proconfig || [];
      const okSearchPath = cfg.some((c) => /^search_path=public,\s*pg_temp$/i.test(c));
      console.log(`  ${okSecdef ? "✅" : "❌"} SECURITY DEFINER  (prosecdef=${f.prosecdef})`);
      console.log(`  ${okStable ? "✅" : "❌"} STABLE            (provolatile=${f.provolatile})`);
      console.log(`  ${okSearchPath ? "✅" : "❌"} search_path set   (proconfig=${JSON.stringify(cfg)})`);
      if (!okSecdef) flag("function is not SECURITY DEFINER");
      if (!okStable) flag("function is not STABLE");
      if (!okSearchPath) flag("function missing search_path=public, pg_temp");
    }

    const { rows: grants } = await pg.query(`
      SELECT grantee, privilege_type
      FROM information_schema.routine_privileges
      WHERE routine_schema='public' AND routine_name='is_user_private'
      ORDER BY grantee;
    `);
    const grantees = new Set(grants.map((g: any) => g.grantee));
    const hasAnon = grantees.has("anon");
    const hasAuthed = grantees.has("authenticated");
    const hasPublic = grantees.has("PUBLIC");
    console.log(`  ${hasAnon ? "✅" : "❌"} GRANT EXECUTE TO anon`);
    console.log(`  ${hasAuthed ? "✅" : "❌"} GRANT EXECUTE TO authenticated`);
    console.log(`  ${!hasPublic ? "✅" : "❌"} EXECUTE revoked from PUBLIC  (public-grant present? ${hasPublic})`);
    if (!hasAnon) flag("anon missing EXECUTE grant");
    if (!hasAuthed) flag("authenticated missing EXECUTE grant");
    if (hasPublic) flag("PUBLIC still has EXECUTE — should have been revoked");
  }

  console.log(`\n${drift ? "❌ DRIFT DETECTED — see warnings above" : "✅ No drift — all 7 tables + helper function match expected state"}\n`);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
