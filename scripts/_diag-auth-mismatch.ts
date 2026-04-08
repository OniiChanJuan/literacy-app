/**
 * Compare auth.users vs public.users for the 2 known emails.
 * Detects whether Google sign-in created a duplicate auth.users row
 * with a different UUID than the migration script assigned.
 *
 * Uses the Supabase admin client + REST API — no Postgres password needed.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_diag-auth-mismatch.ts
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. List ALL auth.users
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) { console.error(listErr); process.exit(1); }

  console.log(`auth.users (${list.users.length} rows):`);
  for (const u of list.users) {
    const idents = (u.identities || []).map(i => i.provider).join(",") || "(none)";
    console.log(`  ${u.id}  ${u.email}  identities=${idents}  created=${u.created_at}`);
  }

  // 2. Read public.users via PostgREST (service role bypasses RLS)
  const r = await fetch(`${url}/rest/v1/users?select=id,email,name,member_number&order=member_number.asc`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  const publicUsers = await r.json();
  console.log(`\npublic.users (${publicUsers.length} rows):`);
  for (const u of publicUsers) {
    console.log(`  [${u.member_number}] ${u.id}  ${u.email}  ${u.name}`);
  }

  // 3. Compare
  console.log(`\nMATCH CHECK:`);
  for (const au of list.users) {
    const pu = publicUsers.find((p: any) => p.email === au.email);
    if (!pu) {
      console.log(`  ⚠️  ${au.email}: in auth.users but NOT in public.users (UUID ${au.id})`);
      continue;
    }
    const match = pu.id === au.id;
    console.log(`  ${match ? "✅" : "❌"} ${au.email}`);
    console.log(`     auth.users.id   = ${au.id}`);
    console.log(`     public.users.id = ${pu.id}`);
    if (!match) {
      console.log(`     ⚠️  MISMATCH — claims.sub (${au.id}) won't find rows owned by ${pu.id}`);
    }
  }

  // 4. Count rows in ratings/reviews/library_entries grouped by user_id
  for (const ep of ["ratings", "reviews", "library_entries", "implicit_signals"]) {
    const r2 = await fetch(`${url}/rest/v1/${ep}?select=user_id`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    const rows = await r2.json();
    if (!Array.isArray(rows)) {
      console.log(`\n${ep}: ERROR ${JSON.stringify(rows)}`);
      continue;
    }
    const byUid: Record<string, number> = {};
    for (const row of rows) {
      const k = row.user_id ?? "(null)";
      byUid[k] = (byUid[k] || 0) + 1;
    }
    console.log(`\n${ep} (${rows.length} total):`);
    for (const [uid, n] of Object.entries(byUid)) console.log(`  ${uid}  ${n}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
