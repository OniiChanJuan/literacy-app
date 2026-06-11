/**
 * ItemPageSkeleton — instant loading state for the item detail routes.
 *
 * Rendered by src/app/[type]/[slug]/loading.tsx and src/app/item/[id]/loading.tsx
 * while the server component fetches. Approximates the above-the-fold structure
 * of ItemPageRender (_page-impl.tsx): back strip → hero band (cover | title +
 * pills | right facts panel) → score-pill strip → description lines.
 *
 * Follows the house skeleton pattern: inline styles + the .skeleton-shimmer
 * class from globals.css (see components/skeleton-card.tsx).
 */

const block = (extra: React.CSSProperties): React.CSSProperties => ({
  background: "rgba(255,255,255,0.05)",
  borderRadius: 4,
  ...extra,
});

function Bar({ w, h = 12, mb = 8, bg }: { w: number | string; h?: number; mb?: number; bg?: string }) {
  return <div className="skeleton-shimmer" style={block({ width: w, height: h, marginBottom: mb, ...(bg ? { background: bg } : {}) })} />;
}

export default function ItemPageSkeleton() {
  return (
    <div style={{ overflowX: "hidden" }}>
      {/* Back-button strip */}
      <div className="content-width" style={{ paddingTop: 12, paddingBottom: 4 }}>
        <Bar w={64} h={14} mb={0} bg="rgba(255,255,255,0.04)" />
      </div>

      {/* Hero band */}
      <div style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(11,11,16,0.95))" }}>
        <div className="content-width" style={{ paddingTop: 18, paddingBottom: 18 }}>
          <div className="hero-layout" style={{ display: "flex", gap: 20, alignItems: "stretch", minHeight: 300 }}>
            {/* Cover */}
            <div className="hero-cover" style={{ flexShrink: 0, width: 200, maxWidth: 200 }}>
              <div className="skeleton-shimmer" style={block({ width: "100%", height: 300, borderRadius: 10 })} />
            </div>

            {/* Center — title, pills, meta, description lines */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              <Bar w={90} h={16} mb={12} bg="rgba(255,255,255,0.04)" />
              <Bar w="60%" h={30} mb={14} />
              {/* tag / vibe pills */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {[64, 80, 56, 72].map((w, i) => (
                  <div key={i} className="skeleton-shimmer" style={block({ width: w, height: 20, borderRadius: 10 })} />
                ))}
              </div>
              <Bar w="38%" h={12} mb={18} bg="rgba(255,255,255,0.04)" />
              {/* description lines */}
              <Bar w="95%" h={11} mb={7} bg="rgba(255,255,255,0.04)" />
              <Bar w="88%" h={11} mb={7} bg="rgba(255,255,255,0.04)" />
              <Bar w="91%" h={11} mb={7} bg="rgba(255,255,255,0.04)" />
              <Bar w="52%" h={11} mb={0} bg="rgba(255,255,255,0.04)" />
            </div>

            {/* Right — quick-reference facts panel */}
            <div className="hero-right" style={{
              flex: "0 0 25%", minWidth: 180, maxWidth: 360,
              borderLeft: "0.5px solid rgba(255,255,255,0.06)", paddingLeft: 16,
            }}>
              {/* creator row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <div className="skeleton-shimmer" style={block({ width: 32, height: 32, borderRadius: "50%" })} />
                <div style={{ flex: 1 }}>
                  <Bar w="70%" h={11} mb={5} />
                  <Bar w="40%" h={9} mb={0} bg="rgba(255,255,255,0.04)" />
                </div>
              </div>
              {/* label / value rows */}
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <Bar w={52} h={10} mb={0} bg="rgba(255,255,255,0.04)" />
                  <Bar w={84} h={10} mb={0} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-banner — score pill strip */}
      <div className="content-width" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0 18px" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton-shimmer" style={block({ width: 64, height: 38, borderRadius: 6, background: "rgba(255,255,255,0.04)" })} />
        ))}
        <div style={{ width: 0.5, height: 28, background: "rgba(255,255,255,0.06)" }} />
        <div className="skeleton-shimmer" style={block({ width: 150, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.04)" })} />
      </div>
    </div>
  );
}
