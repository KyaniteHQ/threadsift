const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

export function savedLabel(savedAt: number, now: number): string {
  const sameYear = new Date(savedAt).getUTCFullYear() === new Date(now).getUTCFullYear();
  const days = Math.floor((now - savedAt) / DAY_MS);

  if (sameYear && days < 1) {
    return "saved today";
  }

  if (sameYear && days < WEEK_DAYS) {
    return `saved ${days}d ago`;
  }

  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(savedAt);

  return `saved ${date}`;
}
