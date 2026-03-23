export function scoreColor(avg: number): string {
  if (avg >= 4) return "var(--score-good)";
  if (avg >= 3) return "var(--score-mid)";
  return "var(--score-poor)";
}
