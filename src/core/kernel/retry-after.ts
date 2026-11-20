import { z } from "zod";

import { DAY_MS, wholeMillisecondsOf } from "../contract/time-units.ts";

const MAX_WAIT_MS = 365 * DAY_MS;

const OUTER_BLANKS = /^[ \t]+|[ \t]+$/gu;

const IMF_FIXDATE =
  /^[A-Z][a-z]{2}, (?<day>\d{2}) (?<month>[A-Z][a-z]{2}) (?<year>\d{4}) (?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2}) GMT$/u;

const RFC850_DATE =
  /^[A-Z][a-z]{5,8}, (?<day>\d{2})-(?<month>[A-Z][a-z]{2})-(?<year>\d{2}) (?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2}) GMT$/u;

const ASCTIME_DATE =
  /^[A-Z][a-z]{2} (?<month>[A-Z][a-z]{2}) (?<day>[ \d]\d) (?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2}) (?<year>\d{4})$/u;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const TWO_DIGIT_YEAR_WINDOW = 50;

const CENTURY = 100;

const DateFieldsSchema = z.object({
  day: z.coerce.number().int().min(1).max(31),
  month: z.enum(MONTHS).transform((name) => MONTHS.indexOf(name)),
  year: z.string(),
  hour: z.coerce.number().int().max(23),
  minute: z.coerce.number().int().max(59),
  second: z.coerce.number().int().max(60),
});

function twoDigitYearOf(digits: string, instantIn: (year: number) => number, now: number): number {
  const year = Number(digits);
  const thisYear = new Date(now).getUTCFullYear();
  const latest = new Date(now).setUTCFullYear(thisYear + TWO_DIGIT_YEAR_WINDOW);
  const century = Math.floor(thisYear / CENTURY) * CENTURY;

  return (
    [century + CENTURY + year, century + year].find(
      (candidate) => instantIn(candidate) <= latest,
    ) ?? century - CENTURY + year
  );
}

function httpDateAt(text: string, now: number): number | null {
  const groups = (IMF_FIXDATE.exec(text) ?? ASCTIME_DATE.exec(text) ?? RFC850_DATE.exec(text))
    ?.groups;
  const fields = DateFieldsSchema.safeParse(groups);

  if (!fields.success) return null;

  const { day, month, year, hour, minute, second } = fields.data;
  const instantIn = (fullYear: number) => Date.UTC(fullYear, month, day, hour, minute, second);
  const fullYear = year.length === 2 ? twoDigitYearOf(year, instantIn, now) : Number(year);

  return new Date(Date.UTC(fullYear, month, day)).getUTCDate() === day ? instantIn(fullYear) : null;
}

export function retryAfterMs(header: string | null, now: number): number | null {
  const text = header?.replaceAll(OUTER_BLANKS, "") ?? "";
  const at = httpDateAt(text, now);
  const wait = wholeMillisecondsOf(text) ?? (at === null ? null : Math.max(0, at - now));

  return wait === null ? null : Math.min(wait, MAX_WAIT_MS);
}
