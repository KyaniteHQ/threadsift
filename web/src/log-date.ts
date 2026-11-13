const FULL = new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "medium" });

const pad = (value: number): string => String(value).padStart(2, "0");

export function localDate(at: number): string {
  const day = new Date(at);

  return `${String(day.getFullYear())}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

export function localTime(at: number): string {
  return FULL.format(new Date(at));
}
