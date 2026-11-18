import { type SQLWrapper, sql } from "drizzle-orm";

export function logMonthAt(at: number): number {
  const date = new Date(at);
  return date.getUTCFullYear() * 100 + date.getUTCMonth() + 1;
}

export function logMonthColumn(at: Readonly<SQLWrapper>) {
  return sql<number>`cast(strftime('%Y%m', ${at} / 1000.0, 'unixepoch') as integer)`;
}

export function logMonthName(month: number): string {
  const digits = String(month).padStart(6, "0");
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

export function logMonthRange(month: number) {
  const start = Date.parse(`${logMonthName(month)}-01T00:00:00.000Z`);
  const next = new Date(start);
  const end = next.setUTCMonth(next.getUTCMonth() + 1);
  return { start, end };
}
