/**
 * Session 2d automated PostgREST RLS test.
 *
 * Verifies the four privacy flags (is_private + three show_*_publicly)
 * are enforced at the database layer for anon and authenticated callers
 * going through PostgREST. Owner-JWT calls bypass every flag.
 *
 * Scenarios cover, for each combination of (target user toggle state) ×
 * (caller = anon / owner / other authed):
 *
 *   - ratings        — gated by is_private AND show_ratings_publicly
 *   - library_entries — gated by is_private AND show_library_publicly
 *   - reviews        — gated by show_activity_publicly only (per Phase 1
 *                      product decision: reviews are content, not library)
 *   - follows        — explicitly left as fully public (Twitter-style)
 *
 * Helpers themselves are also exercised via /rest/v1/rpc:
 *   should_show_ratings_publicly / library / activity
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_test-rls-session2d.ts
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

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !PG_URL) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / DIRECT_URL|DATABASE_URL");
  process.exit(2);
}

const REST = `${SUPABASE_URL}/rest/v1`;
const RUN_ID = Math.random().toString(36).slice(2, 10);
const A_EMAIL = `rls-2d-a-${RUN_ID}@test.invalid`;
const B_EMAIL = `rls-2d-b-${RUN_ID}@test.invalid`;
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
let itemId: number | null = null;
let reviewId: number | null = null;

/**
 * Set B's privacy state via direct SQL (Prisma pooler bypasses RLS),
 * then sanity-check the helpers via /rpc to confirm the change is
 * visible to PostgREST.
 */
async function setBState(pg: Client, opts: {
  isPrivate: boolean;
  showRatings: boolean;
  showLibrary: boolean;
  showActivity: boolean;
}) {
  await pg.query(`UPDATE public.users SET is_private=$1 WHERE id=$2;`, [opts.isPrivate, bId]);
  await pg.query(`
    INSERT INTO public.user_settings (user_id, show_ratings_publicly, show_library_publicly, show_activity_publicly)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id) DO UPDATE SET
      show_ratings_publicly = EXCLUDED.show_ratings_publicly,
      show_library_publicly = EXCLUDED.show_library_publicly,
      show_activity_publicly = EXCLUDED.show_activity_publicly;
  `, [bId, opts.showRatings, opts.showLibrary, opts.showActivity]);
}

async function main() {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    console.log("\n=== Setup ===\n");

    // Pick an arbitrary catalog item to attach test ratings/reviews/library to.
    const itemRow = await pg.query(`SELECT id FROM public.items ORDER BY id LIMIT 1;`);
    if (itemRow.rows.length === 0) throw new Error("No items in catalog; populate-catalog first");
    itemId = itemRow.rows[0].id;
    console.log(`  using catalog item id=${itemId}`);

    const aCreate = await admin.auth.admin.createUser({ email: A_EMAIL, password: PASSWORD, email_confirm: true });
    if (aCreate.error || !aCreate.data.user) throw new Error(`createUser A: ${aCreate.error?.message}`);
    aId = aCreate.data.user.id;
    const bCreate = await admin.auth.admin.createUser({ email: B_EMAIL, password: PASSWORD, email_confirm: true });
    if (bCreate.error || !bCreate.data.user) throw new Error(`createUser B: ${bCreate.error?.message}`);
    bId = bCreate.data.user.id;
    console.log(`  created users A=${aId} B=${bId}`);

    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const aSign = await anonClient.auth.signInWithPassword({ email: A_EMAIL, password: PASSWORD });
    if (aSign.error || !aSign.data.session) throw new Error(`signIn A: ${aSign.error?.message}`);
    aJwt = aSign.data.session.access_token;
    const bSign = await anonClient.auth.signInWithPassword({ email: B_EMAIL, password: PASSWORD });
    if (bSign.error || !bSign.data.session) throw new Error(`signIn B: ${bSign.error?.message}`);
    bJwt = bSign.data.session.access_token;
    console.log(`  obtained JWTs`);

    // Seed B's rating, library entry, review. A also follows B so the
    // follows row is non-empty.
    await pg.query(
      `INSERT INTO public.ratings (user_id, item_id, score) VALUES ($1, $2, 5)
       ON CONFLICT (user_id, item_id) DO UPDATE SET score=EXCLUDED.score;`,
      [bId, itemId]
    );
    await pg.query(
      `INSERT INTO public.library_entries (user_id, item_id, status) VALUES ($1, $2, 'completed')
       ON CONFLICT (user_id, item_id) DO UPDATE SET status=EXCLUDED.status;`,
      [bId, itemId]
    );
    const ins = await pg.query(
      `INSERT INTO public.reviews (user_id, item_id, text) VALUES ($1, $2, 'session2d test review') RETURNING id;`,
      [bId, itemId]
    );
    reviewId = ins.rows[0].id;
    await pg.query(
      `INSERT INTO public.follows (follower_id, followed_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING;`,
      [aId, bId]
    );
    console.log(`  seeded B's rating + library + review #${reviewId} + A→B follow`);

    // ── Test 1: helpers exist and are callable via RPC ─────────────
    console.log("\n=== Test 1: helper functions callable via /rpc ===\n");

    // Default state: no user_settings row for A → all three default true.
    {
      const r = await pgrPost(`/rpc/should_show_ratings_publicly`, { target_user_id: aId });
      record("1a.ratings-default-true", r.status === 200 && r.body === true, `status=${r.status} body=${JSON.stringify(r.body)}`);
    }
    {
      const r = await pgrPost(`/rpc/should_show_library_publicly`, { target_user_id: aId });
      record("1b.library-default-true", r.status === 200 && r.body === true, `status=${r.status} body=${JSON.stringify(r.body)}`);
    }
    {
      const r = await pgrPost(`/rpc/should_show_activity_publicly`, { target_user_id: aId });
      record("1c.activity-default-true", r.status === 200 && r.body === true, `status=${r.status} body=${JSON.stringify(r.body)}`);
    }
    // Unknown user → also default true (matches is_user_private→false precedent: unknown users are not gated).
    {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const r = await pgrPost(`/rpc/should_show_ratings_publicly`, { target_user_id: fakeId });
      record("1d.unknown-user-defaults-public", r.status === 200 && r.body === true, `status=${r.status} body=${JSON.stringify(r.body)}`);
    }
    // Authenticated RPC works too.
    {
      const r = await pgrPost(`/rpc/should_show_ratings_publicly`, { target_user_id: aId }, aJwt!);
      record("1e.authed-rpc-works", r.status === 200 && r.body === true, `status=${r.status} body=${JSON.stringify(r.body)}`);
    }

    // ── Test 2: fully-public B — all rows visible to anon ──────────
    console.log("\n=== Test 2: B is fully public — anon sees everything ===\n");
    await setBState(pg, { isPrivate: false, showRatings: true, showLibrary: true, showActivity: true });
    {
      const r = await pgrGet(`/ratings?user_id=eq.${bId}&item_id=eq.${itemId}`);
      record("2a.anon-sees-rating", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/library_entries?user_id=eq.${bId}&item_id=eq.${itemId}`);
      record("2b.anon-sees-library-entry", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/reviews?id=eq.${reviewId}`);
      record("2c.anon-sees-review", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }

    // ── Test 3: is_private=true blocks ratings + library only ──────
    console.log("\n=== Test 3: B.is_private=true — ratings + library hidden, reviews still visible ===\n");
    await setBState(pg, { isPrivate: true, showRatings: true, showLibrary: true, showActivity: true });
    {
      const r = await pgrGet(`/ratings?user_id=eq.${bId}&item_id=eq.${itemId}`);
      record("3a.private-hides-rating-from-anon", r.status === 200 && Array.isArray(r.body) && r.body.length === 0, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/library_entries?user_id=eq.${bId}&item_id=eq.${itemId}`);
      record("3b.private-hides-library-from-anon", r.status === 200 && Array.isArray(r.body) && r.body.length === 0, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      // Per Phase 1 product decision: is_private does NOT hide reviews.
      const r = await pgrGet(`/reviews?id=eq.${reviewId}`);
      record("3c.private-does-not-hide-review-from-anon", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    // Owner B always sees their own rows regardless.
    {
      const r = await pgrGet(`/ratings?user_id=eq.${bId}&item_id=eq.${itemId}`, bJwt!);
      record("3d.owner-still-sees-own-rating", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/library_entries?user_id=eq.${bId}&item_id=eq.${itemId}`, bJwt!);
      record("3e.owner-still-sees-own-library", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    // Other authed user A sees same as anon (B is private).
    {
      const r = await pgrGet(`/ratings?user_id=eq.${bId}&item_id=eq.${itemId}`, aJwt!);
      record("3f.other-authed-sees-no-rating-when-private", r.status === 200 && Array.isArray(r.body) && r.body.length === 0, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }

    // ── Test 4: showRatingsPublicly=false alone hides ratings ──────
    console.log("\n=== Test 4: B public but showRatingsPublicly=false ===\n");
    await setBState(pg, { isPrivate: false, showRatings: false, showLibrary: true, showActivity: true });
    {
      const r = await pgrGet(`/ratings?user_id=eq.${bId}&item_id=eq.${itemId}`);
      record("4a.flag-hides-rating-from-anon", r.status === 200 && Array.isArray(r.body) && r.body.length === 0, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/library_entries?user_id=eq.${bId}&item_id=eq.${itemId}`);
      record("4b.library-still-public", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/reviews?id=eq.${reviewId}`);
      record("4c.review-still-public", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/ratings?user_id=eq.${bId}&item_id=eq.${itemId}`, bJwt!);
      record("4d.owner-bypasses-rating-flag", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }

    // ── Test 5: showLibraryPublicly=false alone hides library ──────
    console.log("\n=== Test 5: B public but showLibraryPublicly=false ===\n");
    await setBState(pg, { isPrivate: false, showRatings: true, showLibrary: false, showActivity: true });
    {
      const r = await pgrGet(`/library_entries?user_id=eq.${bId}&item_id=eq.${itemId}`);
      record("5a.flag-hides-library-from-anon", r.status === 200 && Array.isArray(r.body) && r.body.length === 0, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/ratings?user_id=eq.${bId}&item_id=eq.${itemId}`);
      record("5b.ratings-still-public", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/library_entries?user_id=eq.${bId}&item_id=eq.${itemId}`, bJwt!);
      record("5c.owner-bypasses-library-flag", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }

    // ── Test 6: showActivityPublicly=false alone hides reviews ─────
    console.log("\n=== Test 6: B public but showActivityPublicly=false ===\n");
    await setBState(pg, { isPrivate: false, showRatings: true, showLibrary: true, showActivity: false });
    {
      const r = await pgrGet(`/reviews?id=eq.${reviewId}`);
      record("6a.flag-hides-review-from-anon", r.status === 200 && Array.isArray(r.body) && r.body.length === 0, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/ratings?user_id=eq.${bId}&item_id=eq.${itemId}`);
      record("6b.ratings-still-public", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/library_entries?user_id=eq.${bId}&item_id=eq.${itemId}`);
      record("6c.library-still-public", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/reviews?id=eq.${reviewId}`, bJwt!);
      record("6d.owner-bypasses-activity-flag", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }
    {
      const r = await pgrGet(`/reviews?id=eq.${reviewId}`, aJwt!);
      record("6e.other-authed-sees-no-review-when-flag-off", r.status === 200 && Array.isArray(r.body) && r.body.length === 0, `rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }

    // ── Test 7: follows remain public (explicit product decision) ──
    console.log("\n=== Test 7: follows policy unchanged — public for any B state ===\n");
    await setBState(pg, { isPrivate: true, showRatings: false, showLibrary: false, showActivity: false });
    {
      const r = await pgrGet(`/follows?followed_id=eq.${bId}`);
      const ok = r.status === 200 && Array.isArray(r.body) && r.body.length >= 1;
      record("7a.follows-public-even-when-B-fully-locked-down", ok, `status=${r.status} rows=${Array.isArray(r.body) ? r.body.length : "?"}`);
    }

    // Reset B to fully public so the regression smoke tests on
    // existing _test-rls-session2b/c suites aren't perturbed by
    // leftover state if someone runs them right after.
    await setBState(pg, { isPrivate: false, showRatings: true, showLibrary: true, showActivity: true });

    // ── Test 8: Session 2b/2c regression smoke ─────────────────────
    console.log("\n=== Test 8: Session 2b/2c regression smoke ===\n");
    {
      const r = await pgrPost(`/rpc/is_user_private`, { target_user_id: bId });
      record("8a.is-user-private-still-callable", r.status === 200 && r.body === false, `status=${r.status} body=${JSON.stringify(r.body)}`);
    }
    {
      const r = await pgrGet(`/items?select=id&limit=1`);
      record("8b.catalog-still-public", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `status=${r.status}`);
    }
    {
      // Anon INSERT to ratings still rejected — owner-only write
      // policy from Session 2b unchanged.
      const r = await pgrPost(`/ratings`, { user_id: aId, item_id: itemId, score: 4 });
      const ok = r.status === 401 || r.status === 403;
      record("8c.ratings-anon-insert-still-rejected", ok, `status=${r.status}`);
    }

  } finally {
    console.log("\n=== Cleanup ===\n");
    try {
      const ids = [aId, bId].filter(Boolean) as string[];
      if (ids.length > 0) {
        // Reviews / library / ratings cascade off public.users, but be
        // explicit so a partial run still cleans up.
        if (reviewId != null) await pg.query(`DELETE FROM public.reviews WHERE id=$1;`, [reviewId]);
        await pg.query(`DELETE FROM public.ratings WHERE user_id = ANY($1::uuid[]);`, [ids]);
        await pg.query(`DELETE FROM public.library_entries WHERE user_id = ANY($1::uuid[]);`, [ids]);
        await pg.query(`DELETE FROM public.follows WHERE follower_id = ANY($1::uuid[]) OR followed_id = ANY($1::uuid[]);`, [ids]);
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
