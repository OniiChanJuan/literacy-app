# Layer 2 — Collective Learning: self-growing clusters

> North-star reference, not a spec. How CrossShelf's hand-authored connection corpus
> grows itself over time **without** losing its editorial point of view.

The curated corpus (158 anchors · 225 canonical clusters · ~1,000 graded connections) is alive on
the cross-shelf surface today. Layer 2 is how clusters **gain members** as the catalog and the user
base grow — by *proposing*, never by *auto-injecting*.

---

## The two mechanisms

**Mechanism 1 — content-based (no users needed).**
Read a cluster's existing member titles' dimensions + metadata (genres, vibes, `item_dimensions`,
shared-thread tags), infer the cluster's "shape," and scan the catalog for other titles that share
those properties → surface them as **candidate members**. Pure content signal; viable as soon as
`item_dimensions` are clean across the catalog. This is the cheap, immediate growth engine — it
turns each authored cluster into an expansion query ("here's a cluster spanning 3 media with these
exemplars — find 10 more that fit").

**Mechanism 2 — behavior-based (Stage-3-gated, needs 50+ real users).**
Convergent user behavior reveals membership the content signal can't see: a recommendation
thumbed-up across *several different anchors*, titles repeatedly co-recommended or co-liked,
clusters of users who rate alike. These patterns both **strengthen existing cluster membership** and
**suggest entirely new clusters** the editors never wrote. Only meaningful once there's enough
behavioral mass to be signal rather than noise (the 50-user floor).

---

## The non-negotiable discipline

**propose → human-confirm → commit. Never auto-inject.**

Both mechanisms output *candidates*, surfaced in the authoring tool for a human to accept, reject,
or re-grade. The moment a statistical signal writes a cluster membership directly, the curated
clusters degrade into TasteDive-style "people who liked X also liked Y" groupings — correlations
with no editorial point of view. **The human judgment is the moat.** A CrossShelf cluster says
*why* things connect ("Violence as a force you can't reason with"), not merely *that* they
co-occur. Automation proposes; a person decides; only then does it become corpus.

---

## Why the schema already built is the foundation

The connection-corpus schema was deliberately shaped so Layer 2 bolts on without rework:

- **Clusters are first-class entities** (`connection_clusters` — id, label, blurb, spans, slug) that
  can *gain members* over time. Membership lives in `connection_recs`, so adding a candidate is one
  confirmed insert — the cluster's identity (the authored blurb + point of view) is untouched.
- **`connection_recs.curated_strength` is the protected editorial grade.** It is written **only** by
  import + the future authoring tool — never by any behavioral signal. A confirmed Layer-2 candidate
  gets a *human-chosen* strength, exactly like a hand-authored one. This is what keeps proposed
  members from diluting the curated grade.
- **`cross_connections.community_adjustment` is a separate, inert lane.** Behavioral signal
  (Mechanism 2) accrues here, physically apart from `curated_strength`, and is **ignored by the read
  layer** until vote-weighting is deliberately enabled. The curated and collective signals never
  share a column — so collective learning can run hot without ever overwriting editorial intent.
- **Votes are captured, not acted on.** Thumbs already record to `cross_connection_votes`
  (vote + user + connection + timestamp) but no longer move cards (the pre-50-user decoupling). That
  accumulating, unspent signal *is* the Mechanism-2 training data, waiting for the gate to open.

In short: curated strength is protected, the collective lane is inert-but-recording, and clusters
are entities that can grow — the schema is a loaded spring for Layer 2.

---

## Sequencing

1. **Now** — curated corpus live on the cross-shelf surface (done).
2. **After `item_dimensions` are clean** — turn on **Mechanism 1**: content-based candidate
   proposals into the authoring tool. No users required.
3. **After 50+ real users** — turn on **Mechanism 2**: behavior-based candidates + new-cluster
   suggestions, drawing on the captured (until-then inert) vote/co-occurrence signal.

Each stage still funnels through propose → human-confirm → commit.

---

## Privacy (hard constraint on Mechanism 2)

Collective behavioral signal must respect private-library enforcement: **aggregate / anonymized
only**, gated at the API/DB the same way the rest of private data is. A private user's individual
ratings, library, or reviews must never surface — even indirectly — through a cluster proposal.
Mechanism 2 reads convergent *populations*, never identifiable individuals.

---

### One-line memory
*Clusters grow by proposal, not injection: content-shape now, convergent behavior at 50 users — and
a human always confirms, because the editorial point of view is the moat. The schema already
separates the protected curated grade from the inert collective lane to make this safe.*
