"use client";

import { Item, TYPES } from "@/lib/data";
import { useRatings } from "@/lib/ratings-context";
import { getMoreSameType, getAcrossMedia, getDeepCuts, getSomethingDifferent } from "@/lib/recommendations";
import Card from "./card";
import ScrollRow from "./scroll-row";

export default function Recommendations({ item }: { item: Item }) {
  const { ratings } = useRatings();
  const userRating = ratings[item.id] || 0;

  const t = TYPES[item.type];
  const moreSame = getMoreSameType(item);
  const acrossMedia = getAcrossMedia(item);

  // Third column depends on user rating
  const liked = userRating >= 4;
  const disliked = userRating > 0 && userRating <= 2;
  const thirdItems = disliked ? getSomethingDifferent(item) : getDeepCuts(item);
  const thirdLabel = disliked ? "Something Different" : "Deep Cuts";
  const thirdSub = disliked
    ? "Didn\u2019t vibe? Try something totally different"
    : liked
      ? "You loved this \u2014 go deeper"
      : "Hidden gems with a similar feel";
  const thirdIcon = disliked ? "\uD83D\uDD00" : "\uD83D\uDC8E";

  return (
    <section style={{ marginTop: 48 }}>
      <h2 style={{
        fontFamily: "var(--font-serif)",
        fontSize: 24,
        fontWeight: 800,
        color: "#fff",
        marginBottom: 28,
      }}>
        Recommendations
      </h2>

      {moreSame.length > 0 && (
        <ScrollRow
          label={`More ${t.label}`}
          sub={`Similar ${t.label.toLowerCase()} you might enjoy`}
          icon={t.icon}
          iconBg={t.color + "33"}
        >
          {moreSame.map((i) => <Card key={i.id} item={i} />)}
        </ScrollRow>
      )}

      {acrossMedia.length > 0 && (
        <ScrollRow
          label="Across Media"
          sub="Same vibes, different medium"
          icon="🌐"
        >
          {acrossMedia.map((i) => <Card key={i.id} item={i} />)}
        </ScrollRow>
      )}

      {thirdItems.length > 0 && (
        <ScrollRow
          label={thirdLabel}
          sub={thirdSub}
          icon={thirdIcon}
        >
          {thirdItems.map((i) => <Card key={i.id} item={i} />)}
        </ScrollRow>
      )}
    </section>
  );
}
