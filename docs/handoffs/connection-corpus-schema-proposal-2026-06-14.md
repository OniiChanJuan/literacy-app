# Connection-corpus schema proposal — Step 1 (PROPOSAL ONLY, no migration run)

For owner review. Holds the hand-authored corpus (158 anchors · 225 canonical clusters ·
994 graded connections) as it actually exists in the nine files, and serves **both** the
one-time bulk importer **and** the future `/admin/connections` authoring tool. **Stop gate:**
nothing is migrated until approved.

**Hard requirement (from the Task B audit):** curated editorial strength is physically separated
from community/behavioral signal. Curated grade is a protected enum; the four behavioral mutators
touch only an inert community lane; the read layer blends — it never writes a blended score back.

---

## 1. Shape of the corpus → shape of the schema

The files are **anchor → cluster (label + blurb) → graded connection (rec title + strength +
shared-threads)**. Strength (`tight/medium/attenuated`) is **per connection**, not per cluster, so
recs must be normalized into their own table (the current `recommended_items` JSON has nowhere to
put a per-rec grade). The consolidated cluster library gives 225 **canonical** clusters reused
across anchors, so clusters are their own table (authored once, attached to many anchors).

Four new tables + a redefinition of the existing `cross_connections` row as the **card**
(= one anchor × one cluster). Crucially, **all existing per-user signal tables
(`cross_connection_votes`, `connection_dismissals`, `connection_events`, `connection_credits`) keep
their `connection_id → cross_connections.id` FK unchanged** — the card stays `cross_connections`, so
no signal-table repointing is needed.

```
Item ──< cross_connections (CARD: anchor × cluster) >── connection_clusters (canonical identity)
                 │
                 └──< connection_recs (graded rec: strength + threads) ──> Item  (or)
                                                                       └──> connection_pending_titles
```

---

## 2. Proposed Prisma models

```prisma
/// Curated editorial strength — PROTECTED. Set only from the authored corpus
/// grade (or 'medium' for legacy rows). NEVER written by votes, dismiss,
/// click-credits, or the decay cron. This is the read-layer ordering input.
enum CuratedStrength {
  tight
  medium
  attenuated
}

/// Canonical cluster (225). Authored ONCE; reused by many anchors across types.
/// Identity = the consolidated "Canonical Clusters" sheet.
model ConnectionCluster {
  id          Int      @id @default(autoincrement())
  slug        String   @unique                 // stable key for idempotent import + authoring tool
  label       String                            // cluster "reason" name
  blurb       String                            // user-facing sentence shown on card expand
  spans       String[] @default([])             // media types it spans (denormalized for the workhorse query)
  isCanonical Boolean  @default(true)           // false = single-anchor unique cluster
  mergedFrom  String[] @default([])             // provenance: original cluster names folded in (Full mapping)
  createdBy   String   @default("import")       // 'import' | 'editorial' | <userId> (authoring tool)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  cards CrossConnection[]
  @@map("connection_clusters")
}

/// THE CARD = one anchor (source Item) × one cluster. This is the unit the user
/// sees, votes on, and dismisses. Evolves the existing cross_connections row:
/// source_item_id stays; reason now holds the cluster blurb (or a per-anchor
/// override); recommended_items JSON is replaced by normalized connection_recs.
model CrossConnection {
  id            Int      @id @default(autoincrement())
  sourceItemId  Int      @map("source_item_id")        // the anchor
  clusterId     Int?     @map("cluster_id")            // null only for un-clustered legacy rows
  reason        String                                  // = cluster blurb, or per-anchor override
  position      Int      @default(0)                    // cluster order under the anchor (authoring)
  createdBy     String   @default("import") @map("created_by")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @default(now()) @updatedAt @map("updated_at")

  // ── COMMUNITY LANE (inert; recorded, not acted on pre-50-users) ──
  // The ONLY mutable signal field. The four behavioral mutators write HERE.
  // Default 0.0 = neutral. Read layer ignores it until vote-weighting is
  // deliberately enabled. NEVER blended into a curated column.
  communityAdjustment Float @default(0.0) @map("community_adjustment")

  // NOTE: quality_score is REMOVED. Its drifted value is discarded at
  // migration (see §4) — editorial grade is never seeded from it.

  sourceItem Item               @relation(fields: [sourceItemId], references: [id], onDelete: Cascade)
  cluster    ConnectionCluster? @relation(fields: [clusterId], references: [id], onDelete: SetNull)
  recs       ConnectionRec[]
  votes      CrossConnectionVote[]
  dismissals ConnectionDismissal[]
  events     ConnectionEvent[]
  credits    ConnectionCredit[]

  @@unique([sourceItemId, clusterId])   // one card per (anchor, cluster); import idempotency
  @@index([sourceItemId])
  @@index([clusterId])
  @@map("cross_connections")
}

/// A single graded recommendation inside a card. 994 of these. curated_strength
/// lives HERE (per-rec), protected.
model ConnectionRec {
  id             Int             @id @default(autoincrement())
  connectionId   Int             @map("connection_id")     // the card
  recItemId      Int?            @map("rec_item_id")        // resolved catalog item (XOR pending)
  pendingTitleId Int?            @map("pending_title_id")   // unresolved → pending queue
  curatedStrength CuratedStrength @map("curated_strength")  // PROTECTED enum
  sharedThreads  String[]        @default([]) @map("shared_threads")  // connection-logic tags
  recMediaAuthored String?       @map("rec_media_authored") // media as authored (cross-media display pre-resolve)
  whatItIs       String?         @map("what_it_is")          // editorial descriptor
  position       Int             @default(0)
  createdBy      String          @default("import") @map("created_by")
  createdAt      DateTime        @default(now()) @map("created_at")
  updatedAt      DateTime        @default(now()) @updatedAt @map("updated_at")

  connection   CrossConnection       @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  recItem      Item?                 @relation(fields: [recItemId], references: [id], onDelete: SetNull)
  pendingTitle ConnectionPendingTitle? @relation(fields: [pendingTitleId], references: [id], onDelete: SetNull)

  @@unique([connectionId, recItemId])       // dedupe a resolved rec within a card
  @@index([connectionId])
  @@index([recItemId])
  @@index([curatedStrength])
  @@map("connection_recs")
}

/// Connections (or anchors) referencing a title not yet in the catalog.
/// Mistborn + Outer Wilds (§2B) land here unless Step 2 ingests them first.
model ConnectionPendingTitle {
  id            Int      @id @default(autoincrement())
  titleAuthored String   @map("title_authored")
  mediaAuthored String   @map("media_authored")
  whatItIs      String?  @map("what_it_is")
  normalizedKey String   @map("normalized_key")   // reconciliation-matcher key for later auto-resolve
  reason        String   @default("not_in_catalog")  // 'not_in_catalog' | 'ambiguous' | 'non_ingestable'
  resolvedItemId Int?    @map("resolved_item_id")  // set when ingested; backfill links recs → real item
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @default(now()) @updatedAt @map("updated_at")

  recs        ConnectionRec[]
  resolvedItem Item?  @relation(fields: [resolvedItemId], references: [id], onDelete: SetNull)

  @@unique([normalizedKey, mediaAuthored])
  @@index([resolvedItemId])
  @@map("connection_pending_titles")
}
```

*(`CrossConnectionVote`, `ConnectionDismissal`, `ConnectionEvent`, `ConnectionCredit` are
unchanged structurally — they still key on `connection_id`. The Item model gains back-relations to
`ConnectionRec.recItem` and `ConnectionPendingTitle.resolvedItem`.)*

---

## 3. Curated vs community — exactly how the four mutators relate (the non-negotiable)

| Lane | Field | Who writes it | Read layer |
|---|---|---|---|
| **Curated (protected)** | `connection_recs.curated_strength` (enum) | Import + authoring tool **only**. Set once from the authored grade. | **Ordering input.** Mapped to a numeric base, e.g. `tight→1.5, medium→1.0, attenuated→0.6`. |
| **Community (inert)** | `cross_connections.community_adjustment` (Float, default 0) | The four behavioral mutators below. | **Ignored** until `COMMUNITY_WEIGHTING_ENABLED` (50+ users). |

**All four existing mutators move off the curated path and onto the community lane (or stay as raw rows):**

| Mutator | Today (writes `quality_score`) | Under this schema |
|---|---|---|
| **Votes** ([vote/route.ts]) | ±0.1 to `quality_score` | **Already fixed (commit `bf05fc8`): record-only** to `cross_connection_votes`. When the lane is formalized, may accrue into `community_adjustment`. **Never** `curated_strength`. |
| **Dismiss** ([dismiss/route.ts]) | −0.15 to `quality_score` | Writes `connection_dismissals` (per-user hide — legit UI state, kept) + optionally `community_adjustment`. **Never** `curated_strength`. |
| **Click/library/rating credits** ([connection-credit.ts]) | +0.02…+0.40 / −0.30 to `quality_score` | Writes `connection_events`/`connection_credits` + `community_adjustment`. **Never** `curated_strength`. |
| **Decay cron** ([cron/cleanup]) | pulls `quality_score` → 1.0 | Pulls `community_adjustment` → **0.0** (neutral). **Never** `curated_strength`. |

**Read-layer blend (no mutable blended column):** ordering uses `curatedBase(curated_strength)` only.
When weighting is later enabled, the effective score is computed **at query time** as
`curatedBase + g(community_adjustment)` and **never written back**. There is deliberately no single
column holding a blended mutable score. The `attenuated` grade drives the serendipity slot rather
than a `< 0.3` hide cutoff — so community votes can no longer bury a curated connection.

---

## 4. Migration — how editorial grades stay protected

1. **Add** the four new tables + `enum CuratedStrength` + `community_adjustment` (default 0.0).
2. **Backfill from the corpus**, not from any float: `curated_strength` is set **only** from the
   authored `tight/medium/attenuated`. The drifted `quality_score` is **never read into a grade.**
3. **Existing seed `cross_connections` rows** (pre-cluster, flat JSON recs, drifted `quality_score`):
   the corpus supersedes them. Each is either matched to a corpus card or, if not covered, normalized
   with `curated_strength = medium` (the neutral default) and a synthetic/legacy cluster. **Their
   accumulated `quality_score` drift is discarded** — this is precisely what protects the grade: an
   editorial grade can never have been polluted by votes because it is never derived from the
   mutated float.
4. **Drop `quality_score`** (and its `@@index`) once the read layer is repointed (a later step). Until
   then it can be left in place, ignored, to keep the cutover reversible.
5. **Idempotency:** `connection_clusters.slug`, `cross_connections @@unique(sourceItemId, clusterId)`,
   `connection_recs @@unique(connectionId, recItemId)`, and
   `connection_pending_titles @@unique(normalizedKey, mediaAuthored)` make the bulk importer safe to
   re-run.

---

## 5. Scope notes / what this is NOT

- **No read-layer rewrite here.** `/api/cross-connections` (ordering, the 0.3 threshold, personalized
  final_score) and the four mutators are repointed in **Step 3/4**, not Step 1. This proposal only
  defines the storage + the contract they must follow.
- **No `/admin/connections` UI** — schema is designed *for* it (slug, position, createdBy, updatedAt,
  pending queue, per-anchor blurb override) but the tool is a later task.
- **Migration convention:** raw SQL `scripts/migrate-*.ts` using `pg.Client` + `DIRECT_URL`,
  transactional + idempotent (repo template: `scripts/migrate-add-library-created-at.ts`), plus the
  Prisma model change — run only after approval.

---

## Open questions for your review
1. **Community lane form:** `community_adjustment` Float on the card (recommended — explicit accruing
   lane) vs. *no* mutable column at all (compute community purely from raw vote/dismiss/credit rows at
   read time). Both keep curated_strength pristine; the float is less read-layer churn later.
2. **Legacy seed rows:** replace-with-corpus + `medium` fallback (proposed), or preserve them as-is
   under a "legacy" cluster?
3. **Curated base mapping** (`tight 1.5 / medium 1.0 / attenuated 0.6`) — tune now or in Step 3?

**Stop gate — awaiting approval before any migration.**
