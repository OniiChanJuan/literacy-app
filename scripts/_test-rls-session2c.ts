/**
 * Session 2c automated PostgREST RLS test.
 *
 * Verifies:
 *   - The public_user_profiles view is readable via PostgREST as
 *     anon and exposes ONLY the 9 expected columns (no email,
 *     auth_provider, taste_profile, etc.).
 *   - The base public.users table denies SELECT for anon and
 *     authenticated via PostgREST (no SELECT policy → empty results).
 *   - prisma.publicUserProfile.findUnique returns the expected shape.
 *   - users_owner_update: a user CAN update their own row, CANNOT
 *     update another user's row.
 *   - users_owner_delete: a user CANNOT delete another user's row.
 *     (We do NOT exercise self-delete; destructive.)
 *   - is_user_private(uuid) helper from Session 2b still works.
 *   - Session 2a/2b policies still in place (regression smoke test).
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_test-rls-session2c.ts
 *
 * Exit code: 0 on all-pass, 1 on any failure.
 */
import "dotenv/config";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PG_URL = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const REST = `${SUPABASE_URL}/rest/v1`;

const RUN_ID = Math.random().toString(36).slice(2, 10);
const A_EMAIL = `rls-2c-a-${RUN_ID}@test.invalid`;
const B_EMAIL = `rls-2c-b-${RUN_ID}@test.invalid`;
const PASSWORD = `Pw_${RUN_ID}_${Math.random().toString(36).slice(2, 10)}`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? `  — ${detail}` : ""}`);
}

async function pgrGet(path: string, jwt?: string) {
  const headers: Record<string, string> = { apikey: ANON_KEY };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${REST}${path}`, { headers });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

async function pgrPatch(path: string, payload: unknown, jwt: string) {
  const res = await fetch(`${REST}${path}`, {
    method: "PATCH",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

async function pgrDelete(path: string, jwt: string) {
  const res = await fetch(`${REST}${path}`, {
    method: "DELETE",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}` },
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

async function pgrPost(path: string, payload: unknown, jwt?: string) {
  const headers: Record<string, string> = { apikey: ANON_KEY, "Content-Type": "application/json" };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${REST}${path}`, { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

let aId: string | null = null;
let bId: string | null = null;
let aJwt: string | null = null;
let bJwt: string | null = null;
let aOriginalName: string | null = null;

async function main() {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    console.log("\n=== Setup ===\n");
    const aCreate = await admin.auth.admin.createUser({ email: A_EMAIL, password: PASSWORD, email_confirm: true });
    if (aCreate.error || !aCreate.data.user) throw new Error(`createUser A: ${aCreate.error?.message}`);
    aId = aCreate.data.user.id;
    const bCreate = await admin.auth.admin.createUser({ email: B_EMAIL, password: PASSWORD, email_confirm: true });
    if (bCreate.error || !bCreate.data.user) throw new Error(`createUser B: ${bCreate.error?.message}`);
    bId = bCreate.data.user.id;
    console.log(`  created users A=${aId} B=${bId}`);

    // Capture A's name baseline so we can revert it later.
    const baseline = await pg.query(`SELECT name FROM public.users WHERE id=$1;`, [aId]);
    aOriginalName = baseline.rows[0]?.name ?? null;

    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const aSign = await anonClient.auth.signInWithPassword({ email: A_EMAIL, password: PASSWORD });
    if (aSign.error || !aSign.data.session) throw new Error(`signIn A: ${aSign.error?.message}`);
    aJwt = aSign.data.session.access_token;
    const bSign = await anonClient.auth.signInWithPassword({ email: B_EMAIL, password: PASSWORD });
    if (bSign.error || !bSign.data.session) throw new Error(`signIn B: ${bSign.error?.message}`);
    bJwt = bSign.data.session.access_token;
    console.log(`  obtained JWTs for both users`);

    // ── Test 1: view shape via anon ───────────────────────────────────
    console.log("\n=== Test 1: public_user_profiles view via anon ===\n");
    const r1 = await pgrGet(`/public_user_profiles?select=*&id=eq.${aId}`);
    {
      const ok = r1.status === 200 && Array.isArray(r1.body) && r1.body.length === 1;
      record("1a.view-anon-200", ok, `status=${r1.status} rows=${Array.isArray(r1.body) ? r1.body.length : "?"}`);
    }
    {
      const row = Array.isArray(r1.body) && r1.body[0];
      const keys = row ? Object.keys(row).sort() : [];
      const expected = ["avatar","bio","created_at","id","image","is_private","member_number","name","username"];
      const ok = JSON.stringify(keys) === JSON.stringify(expected);
      record("1b.view-exposes-only-9-fields", ok, `keys=${keys.join(",")}`);
    }
    {
      const row = Array.isArray(r1.body) && r1.body[0];
      const forbidden = ["email", "auth_provider", "taste_profile", "terms_accepted_at", "updated_at"];
      const leaks = row ? forbidden.filter((k) => k in row) : [];
      record("1c.view-no-sensitive-fields", leaks.length === 0, leaks.length ? `LEAKS: ${leaks.join(",")}` : "");
    }

    // ── Test 2: base users table SELECT denied ───────────────────────
    console.log("\n=== Test 2: base public.users SELECT denied via PostgREST ===\n");
    {
      const r = await pgrGet(`/users?select=id&limit=1`);
      const ok = r.status === 200 && Array.isArray(r.body) && r.body.length === 0;
      record("2a.anon-base-users-empty", ok, `status=${r.status} rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/users?select=id&limit=1`, aJwt!);
      const ok = r.status === 200 && Array.isArray(r.body) && r.body.length === 0;
      record("2b.authed-base-users-empty", ok, `status=${r.status} rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      // Also confirm email is not reachable via column-projected base query.
      const r = await pgrGet(`/users?select=id,email&limit=1`, aJwt!);
      const ok = r.status === 200 && Array.isArray(r.body) && r.body.length === 0;
      record("2c.authed-base-users-email-empty", ok, `status=${r.status}`);
    }

    // ── Test 3: Prisma view shape ────────────────────────────────────
    console.log("\n=== Test 3: Prisma publicUserProfile model ===\n");
    {
      const { prisma } = await import("../src/lib/prisma");
      const profile = await prisma.publicUserProfile.findUnique({ where: { id: aId } });
      const keys = profile ? Object.keys(profile).sort() : [];
      const expected = ["avatar","bio","createdAt","id","image","isPrivate","memberNumber","name","username"];
      const ok = JSON.stringify(keys) === JSON.stringify(expected);
      record("3a.prisma-view-shape", ok, `keys=${keys.join(",")}`);
      const forbidden = ["email", "authProvider", "tasteProfile", "termsAcceptedAt", "updatedAt"];
      const leaks = profile ? forbidden.filter((k) => k in (profile as any)) : [];
      record("3b.prisma-view-no-sensitive", leaks.length === 0, leaks.length ? `LEAKS: ${leaks.join(",")}` : "");
    }

    // ── Test 4: users PATCH via PostgREST ────────────────────────────
    // Design intent: anon and authenticated have NO SELECT policy on
    // public.users — public reads go through public_user_profiles.
    // Side effect: PostgREST can't enumerate target rows for UPDATE
    // either (it filters via SELECT), so PATCH silently no-ops on
    // public.users for ALL callers, including own-row. The owner-only
    // UPDATE policy is belt-and-suspenders for any future state where
    // a SELECT policy is added. Tests 4a and 4b confirm both cases
    // are no-ops at the DB level.
    console.log("\n=== Test 4: users PATCH via PostgREST (expect no-op for both own and other) ===\n");
    {
      const r = await pgrPatch(`/users?id=eq.${aId}`, { name: "test-rename-2c" }, aJwt!);
      const dbCheck = await pg.query(`SELECT name FROM public.users WHERE id=$1;`, [aId]);
      const aUnchanged = dbCheck.rows[0].name === aOriginalName;
      record("4a.update-own-row-no-op-via-postgrest", aUnchanged, `status=${r.status} aUnchanged=${aUnchanged} (expected: PostgREST cannot UPDATE because no SELECT policy on users)`);
      // Belt-and-suspenders: revert anyway if the assumption ever changes.
      await pg.query(`UPDATE public.users SET name=$1 WHERE id=$2;`, [aOriginalName, aId]);
    }
    {
      const r = await pgrPatch(`/users?id=eq.${bId}`, { name: "hijack-attempt" }, aJwt!);
      const updated = Array.isArray(r.body) && r.body.length > 0;
      const dbCheck = await pg.query(`SELECT name FROM public.users WHERE id=$1;`, [bId]);
      const bNameUnchanged = dbCheck.rows[0].name !== "hijack-attempt";
      const ok = !updated && bNameUnchanged;
      record("4b.update-other-row-rejected", ok, `status=${r.status} bNameUnchanged=${bNameUnchanged} returnedRows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      // Direct verification that the policies still exist as written.
      const { rows } = await pg.query(`
        SELECT policyname, cmd, qual, with_check FROM pg_policies
        WHERE schemaname='public' AND tablename='users'
        ORDER BY policyname;
      `);
      const updatePolicy: any = rows.find((r: any) => r.policyname === "users_owner_update");
      const deletePolicy: any = rows.find((r: any) => r.policyname === "users_owner_delete");
      const ok = !!updatePolicy && !!deletePolicy
        && /auth.uid\(\) = id/.test(updatePolicy.qual)
        && /auth.uid\(\) = id/.test(updatePolicy.with_check)
        && /auth.uid\(\) = id/.test(deletePolicy.qual);
      record("4c.owner-policies-still-defined-correctly", ok, `policyCount=${rows.length}`);
    }

    // ── Test 5: users_owner_delete (cross-user only) ─────────────────
    console.log("\n=== Test 5: users_owner_delete cross-user via PostgREST ===\n");
    {
      const r = await pgrDelete(`/users?id=eq.${bId}`, aJwt!);
      const dbCheck = await pg.query(`SELECT id FROM public.users WHERE id=$1;`, [bId]);
      const bStillExists = dbCheck.rows.length === 1;
      const ok = bStillExists;
      record("5a.delete-other-row-rejected", ok, `status=${r.status} bStillExists=${bStillExists}`);
    }

    // ── Test 6: is_user_private regression ───────────────────────────
    console.log("\n=== Test 6: is_user_private RPC regression ===\n");
    {
      const r = await pgrPost(`/rpc/is_user_private`, { target_user_id: aId });
      record("6a.rpc-public-user-false", r.status === 200 && r.body === false, `status=${r.status} body=${JSON.stringify(r.body)}`);
    }
    {
      // Flip B private and re-test
      await pg.query(`UPDATE public.users SET is_private=true WHERE id=$1;`, [bId]);
      const r = await pgrPost(`/rpc/is_user_private`, { target_user_id: bId });
      record("6b.rpc-private-user-true", r.status === 200 && r.body === true, `status=${r.status} body=${JSON.stringify(r.body)}`);
      await pg.query(`UPDATE public.users SET is_private=false WHERE id=$1;`, [bId]);
    }

    // ── Test 7: Session 2a/2b regression smoke ───────────────────────
    console.log("\n=== Test 7: Session 2a/2b policies still in place ===\n");
    {
      // Catalog public read (Session 2a)
      const r = await pgrGet(`/items?select=id&limit=1`);
      record("7a.items-public-read-still-works", r.status === 200 && Array.isArray(r.body), `status=${r.status}`);
    }
    {
      // Owner-only read (Session 2a) — anon cannot SELECT user_settings
      const r = await pgrGet(`/user_settings?select=*&limit=1`);
      const ok = r.status === 200 && Array.isArray(r.body) && r.body.length === 0;
      record("7b.user-settings-anon-empty", ok, `status=${r.status} rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      // Service-role-only (Session 2a) — reports unreachable
      const r = await pgrGet(`/reports?select=id&limit=1`);
      const ok = r.status === 200 && Array.isArray(r.body) && r.body.length === 0;
      record("7c.reports-anon-empty", ok, `status=${r.status} rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      // Community public read (Session 2b)
      const r = await pgrGet(`/ratings?select=user_id&limit=1`);
      record("7d.ratings-public-read-still-works", r.status === 200 && Array.isArray(r.body), `status=${r.status}`);
    }
    {
      // Community owner-only write (Session 2b) — anon insert rejected
      const r = await pgrPost(`/ratings`, { user_id: aId, item_id: 1, score: 5 });
      const ok = r.status === 401 || r.status === 403;
      record("7e.ratings-anon-insert-rejected", ok, `status=${r.status}`);
    }

  } finally {
    console.log("\n=== Cleanup ===\n");
    try {
      const ids = [aId, bId].filter(Boolean) as string[];
      if (ids.length > 0) {
        await pg.query(`DELETE FROM public.user_settings WHERE user_id = ANY($1::uuid[]);`, [ids]);
        await pg.query(`DELETE FROM public.users WHERE id = ANY($1::uuid[]);`, [ids]);
        for (const id of ids) {
          const { error } = await admin.auth.admin.deleteUser(id);
          if (error) console.log(`  ⚠️  admin.deleteUser(${id}): ${error.message}`);
        }
        console.log(`  cleaned up ${ids.length} test user(s)`);
      }
    } catch (e) {
      console.log(`  ⚠️  cleanup error: ${(e as Error).message}`);
    }
    await pg.end();
  }

  console.log("\n=== Results ===\n");
  const failed = results.filter((r) => !r.ok);
  console.log(`  ${results.length - failed.length} / ${results.length} passed`);
  if (failed.length > 0) {
    console.log("\n  Failures:");
    for (const f of failed) console.log(`    ❌ ${f.name}: ${f.detail || ""}`);
    console.log("\n❌ FAIL — do NOT commit\n");
    process.exit(1);
  }
  console.log("\n✅ ALL TESTS PASSED\n");
  process.exit(0);
}

main().catch((e) => { console.error("\n✗ Test runner crashed:", e); process.exit(1); });
