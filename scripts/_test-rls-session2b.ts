/**
 * Session 2b automated PostgREST RLS test.
 *
 * Approach:
 *   1. Create two ephemeral test users via service-role admin API
 *      (auth.signUp triggers handle_new_user which inserts into
 *      public.users). One is left public (is_private=false), the
 *      other is flipped to is_private=true via direct SQL (Prisma
 *      pooler bypasses RLS — we don't have a users-table policy yet,
 *      that's Session 2c).
 *   2. Sign in as each via signInWithPassword to obtain real
 *      access tokens issued by Supabase Auth.
 *   3. Hit PostgREST (/rest/v1/...) with the anon key, the public
 *      user's JWT, and the private user's JWT, asserting the
 *      expected behavior for each policy.
 *   4. Cleanup in `finally`: delete any test rows, drop the
 *      public.users row, then admin.deleteUser the auth.users row.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_test-rls-session2b.ts
 *
 * Exit code: 0 on all-pass, 1 on any failure.
 */
import "dotenv/config";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

// ── Config ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PG_URL = process.env.DIRECT_URL || process.env.DATABASE_URL!;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !PG_URL) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / DIRECT_URL|DATABASE_URL");
  process.exit(2);
}

const REST = `${SUPABASE_URL}/rest/v1`;
const RUN_ID = Math.random().toString(36).slice(2, 10);
const PUB_EMAIL = `rls-test-public-${RUN_ID}@test.invalid`;
const PRIV_EMAIL = `rls-test-private-${RUN_ID}@test.invalid`;
const PASSWORD = `Pw_${RUN_ID}_${Math.random().toString(36).slice(2, 10)}`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Test harness ───────────────────────────────────────────────────────
type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? `  — ${detail}` : ""}`);
}

// ── Fetch helpers ──────────────────────────────────────────────────────
async function pgrGet(path: string, jwt?: string) {
  const headers: Record<string, string> = { apikey: ANON_KEY };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${REST}${path}`, { headers });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

async function pgrPost(path: string, payload: unknown, jwt?: string, returnRep = false) {
  const headers: Record<string, string> = {
    apikey: ANON_KEY,
    "Content-Type": "application/json",
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  if (returnRep) headers.Prefer = "return=representation";
  const res = await fetch(`${REST}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

// ── State that needs cleaning up no matter what ────────────────────────
let pubUserId: string | null = null;
let privUserId: string | null = null;
let pubJwt: string | null = null;
let privJwt: string | null = null;
let unratedItemId: number | null = null;

async function main() {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    // ── Setup ─────────────────────────────────────────────────────────
    console.log("\n=== Setup ===\n");

    // Create both test users via admin API (email_confirm so we can
    // signInWithPassword immediately).
    const { data: pubCreate, error: pubErr } = await admin.auth.admin.createUser({
      email: PUB_EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (pubErr || !pubCreate.user) throw new Error(`createUser pub: ${pubErr?.message}`);
    pubUserId = pubCreate.user.id;
    console.log(`  created public test user: ${pubUserId}`);

    const { data: privCreate, error: privErr } = await admin.auth.admin.createUser({
      email: PRIV_EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (privErr || !privCreate.user) throw new Error(`createUser priv: ${privErr?.message}`);
    privUserId = privCreate.user.id;
    console.log(`  created private test user: ${privUserId}`);

    // The handle_new_user trigger should have inserted public.users rows.
    // Confirm and flip privUser.is_private = true.
    const checkRows = await pg.query(
      `SELECT id, is_private FROM public.users WHERE id = ANY($1::uuid[]);`,
      [[pubUserId, privUserId]]
    );
    if (checkRows.rowCount !== 2) {
      throw new Error(`Expected 2 public.users rows after admin.createUser, got ${checkRows.rowCount}. handle_new_user trigger may not have fired.`);
    }
    await pg.query(`UPDATE public.users SET is_private = true WHERE id = $1;`, [privUserId]);
    await pg.query(`UPDATE public.users SET is_private = false WHERE id = $1;`, [pubUserId]);
    console.log(`  set public user is_private=false, private user is_private=true`);

    // Sign in as each to mint real JWTs.
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const pubSignin = await anonClient.auth.signInWithPassword({ email: PUB_EMAIL, password: PASSWORD });
    if (pubSignin.error || !pubSignin.data.session) throw new Error(`signIn pub: ${pubSignin.error?.message}`);
    pubJwt = pubSignin.data.session.access_token;

    const privSignin = await anonClient.auth.signInWithPassword({ email: PRIV_EMAIL, password: PASSWORD });
    if (privSignin.error || !privSignin.data.session) throw new Error(`signIn priv: ${privSignin.error?.message}`);
    privJwt = privSignin.data.session.access_token;
    console.log(`  obtained JWTs for both users`);

    // Seed a library_entries row for each user so we have something
    // for the privacy SELECT tests to find. Use any item that exists.
    const itemRow = await pg.query(`SELECT id FROM public.items ORDER BY id LIMIT 1;`);
    if (itemRow.rowCount === 0) throw new Error("No items in DB to seed library_entries against");
    const seedItemId = itemRow.rows[0].id;
    await pg.query(
      `INSERT INTO public.library_entries (user_id, item_id, status, progress_current, progress_total)
       VALUES ($1, $2, 'completed', 0, 0), ($3, $2, 'completed', 0, 0)
       ON CONFLICT (user_id, item_id) DO NOTHING;`,
      [pubUserId, seedItemId, privUserId]
    );
    console.log(`  seeded library_entries (item_id=${seedItemId}) for both users`);

    // Find an item the public user has NOT rated, for the own-write test.
    const unrated = await pg.query(
      `SELECT id FROM public.items
       WHERE id NOT IN (SELECT item_id FROM public.ratings WHERE user_id = $1)
       ORDER BY id LIMIT 1;`,
      [pubUserId]
    );
    if (unrated.rowCount === 0) throw new Error("No unrated items available for write test");
    unratedItemId = unrated.rows[0].id;

    // ── Test group 1: anon public read ────────────────────────────────
    console.log("\n=== Test 1: anon GET on public-read tables (expect 200 + array) ===\n");
    for (const t of ["ratings", "reviews", "follows", "franchise_ratings", "franchise_follows", "review_helpful_votes"]) {
      const r = await pgrGet(`/${t}?select=*&limit=1`);
      const ok = r.status === 200 && Array.isArray(r.body);
      record(`1.${t}`, ok, `status=${r.status} bodyType=${Array.isArray(r.body) ? "array" : typeof r.body}`);
    }

    // ── Test 2: anon write rejection ──────────────────────────────────
    console.log("\n=== Test 2: anon POST to ratings (expect rejection) ===\n");
    {
      const r = await pgrPost("/ratings", { user_id: pubUserId, item_id: unratedItemId, score: 5 });
      // PostgREST returns 401 (no JWT, anon role can't insert) or
      // 403 (RLS violation). Anything in 4xx is a pass; 2xx is a fail.
      const ok = r.status === 401 || r.status === 403;
      record("2.anon-insert-rejected", ok, `status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`);
    }

    // ── Test 3: cross-user write rejection ────────────────────────────
    console.log("\n=== Test 3: authenticated POST with someone else's user_id (expect 403) ===\n");
    {
      const r = await pgrPost(
        "/ratings",
        { user_id: privUserId, item_id: unratedItemId, score: 5 },
        pubJwt!,
      );
      const ok = r.status === 403;
      record("3.cross-user-insert-rejected", ok, `status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`);
    }

    // ── Test 4: own-row write success + cleanup ───────────────────────
    console.log("\n=== Test 4: authenticated POST own-row (expect 201) ===\n");
    {
      const r = await pgrPost(
        "/ratings",
        { user_id: pubUserId, item_id: unratedItemId, score: 4 },
        pubJwt!,
        true,
      );
      const ok = r.status === 201 && Array.isArray(r.body) && r.body[0]?.score === 4;
      record("4.own-insert-succeeds", ok, `status=${r.status}`);
      // Always try to clean up regardless of outcome
      await pg.query(`DELETE FROM public.ratings WHERE user_id = $1 AND item_id = $2;`, [pubUserId, unratedItemId]);
    }

    // ── Test 5: library_entries privacy ───────────────────────────────
    console.log("\n=== Test 5: library_entries privacy (the critical case) ===\n");

    // 5a. anon GET public user's library → rows
    {
      const r = await pgrGet(`/library_entries?select=*&user_id=eq.${pubUserId}`);
      const ok = r.status === 200 && Array.isArray(r.body) && r.body.length >= 1;
      record("5a.anon-read-public-user-library", ok, `status=${r.status} rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }

    // 5b. anon GET private user's library → empty
    {
      const r = await pgrGet(`/library_entries?select=*&user_id=eq.${privUserId}`);
      const ok = r.status === 200 && Array.isArray(r.body) && r.body.length === 0;
      record("5b.anon-read-private-user-library-empty", ok, `status=${r.status} rows=${Array.isArray(r.body) ? r.body.length : "?"} (expected 0)`);
    }

    // 5c. private user reads own library → rows
    {
      const r = await pgrGet(`/library_entries?select=*&user_id=eq.${privUserId}`, privJwt!);
      const ok = r.status === 200 && Array.isArray(r.body) && r.body.length >= 1;
      record("5c.private-user-reads-own-library", ok, `status=${r.status} rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }

    // 5d. different (public) user reads private user's library → empty
    {
      const r = await pgrGet(`/library_entries?select=*&user_id=eq.${privUserId}`, pubJwt!);
      const ok = r.status === 200 && Array.isArray(r.body) && r.body.length === 0;
      record("5d.other-user-reads-private-library-empty", ok, `status=${r.status} rows=${Array.isArray(r.body) ? r.body.length : "?"} (expected 0)`);
    }

    // 5e. authenticated user reads /library_entries with no filter,
    // RLS should still let them see their own. We assert at least
    // their seeded row appears.
    {
      const r = await pgrGet(`/library_entries?select=*`, pubJwt!);
      const ok = r.status === 200 && Array.isArray(r.body)
        && r.body.some((row: any) => row.user_id === pubUserId);
      record("5e.own-row-visible-without-filter", ok, `status=${r.status} rowsContainOwn=${Array.isArray(r.body) ? r.body.some((row: any) => row.user_id === pubUserId) : "?"}`);
    }

    // ── Test 6: is_user_private RPC ───────────────────────────────────
    console.log("\n=== Test 6: is_user_private RPC ===\n");
    async function rpc(targetId: string, jwt?: string) {
      return pgrPost("/rpc/is_user_private", { target_user_id: targetId }, jwt);
    }

    {
      const r = await rpc(privUserId!);
      const ok = r.status === 200 && r.body === true;
      record("6a.rpc-private-user-true", ok, `status=${r.status} body=${JSON.stringify(r.body)}`);
    }
    {
      const r = await rpc(pubUserId!);
      const ok = r.status === 200 && r.body === false;
      record("6b.rpc-public-user-false", ok, `status=${r.status} body=${JSON.stringify(r.body)}`);
    }
    {
      const r = await rpc("00000000-0000-0000-0000-000000000000");
      const ok = r.status === 200 && r.body === false;
      record("6c.rpc-unknown-user-false", ok, `status=${r.status} body=${JSON.stringify(r.body)}`);
    }

  } finally {
    // ── Cleanup ───────────────────────────────────────────────────────
    console.log("\n=== Cleanup ===\n");
    try {
      const idsToClean = [pubUserId, privUserId].filter(Boolean) as string[];
      if (idsToClean.length > 0) {
        // Test data: delete library_entries + any leftover ratings for both test users.
        // Then delete the public.users rows. Auth user goes via admin API.
        await pg.query(`DELETE FROM public.library_entries WHERE user_id = ANY($1::uuid[]);`, [idsToClean]);
        await pg.query(`DELETE FROM public.ratings WHERE user_id = ANY($1::uuid[]);`, [idsToClean]);
        await pg.query(`DELETE FROM public.user_settings WHERE user_id = ANY($1::uuid[]);`, [idsToClean]);
        await pg.query(`DELETE FROM public.users WHERE id = ANY($1::uuid[]);`, [idsToClean]);
        for (const id of idsToClean) {
          const { error } = await admin.auth.admin.deleteUser(id);
          if (error) console.log(`  ⚠️  admin.deleteUser(${id}) failed: ${error.message}`);
        }
        console.log(`  cleaned up ${idsToClean.length} test user(s)`);
      }
    } catch (e) {
      console.log(`  ⚠️  cleanup error: ${(e as Error).message}`);
    }
    await pg.end();
  }

  // ── Final report ────────────────────────────────────────────────────
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

main().catch((e) => {
  console.error("\n✗ Test runner crashed:", e);
  process.exit(1);
});
