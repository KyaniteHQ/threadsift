const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const MONTH_AND_DAY = { month: "short", day: "numeric" } as const;
const DAY_WITH_YEAR = new Intl.DateTimeFormat("en-US", { ...MONTH_AND_DAY, year: "numeric" });
const DAY_IN_YEAR = new Intl.DateTimeFormat("en-US", MONTH_AND_DAY);

function daysBetween(savedAt: number, now: number): number {
  const savedDay = new Date(savedAt);
  const today = new Date(now);
  const savedUtc = Date.UTC(savedDay.getFullYear(), savedDay.getMonth(), savedDay.getDate());
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  return Math.round((todayUtc - savedUtc) / DAY_MS);
}

export function ageLabel(savedAt: number, now: number): string {
  const sameYear = new Date(savedAt).getFullYear() === new Date(now).getFullYear();
  const days = daysBetween(savedAt, now);

  if (sameYear && days < 1) {
    return "today";
  }

  if (sameYear && days < WEEK_DAYS) {
    return `${days}d ago`;
  }

  return (sameYear ? DAY_IN_YEAR : DAY_WITH_YEAR).format(savedAt);
}

export function savedLabel(savedAt: number, now: number): string {
  return `saved ${ageLabel(savedAt, now)}`;
}
