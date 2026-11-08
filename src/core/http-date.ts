const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY = "(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)";
const LONG_WEEKDAY = "(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)";
const CLOCK = String.raw`(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})`;
const MONTH = "(?<month>[A-Z][a-z]{2})";

const IMF_FIXDATE = new RegExp(
  String.raw`^${WEEKDAY}, (?<day>\d{2}) ${MONTH} (?<year>\d{4}) ${CLOCK} GMT$`,
  "u",
);

const RFC_850 = new RegExp(
  String.raw`^${LONG_WEEKDAY}, (?<day>\d{2})-${MONTH}-(?<year>\d{2}) ${CLOCK} GMT$`,
  "u",
);

const ASCTIME = new RegExp(
  String.raw`^${WEEKDAY} ${MONTH} (?<day>[ \d]\d) ${CLOCK} (?<year>\d{4})$`,
  "u",
);

const FORMS = [IMF_FIXDATE, RFC_850, ASCTIME];
const HALF_CENTURY_YEARS = 50;
const CENTURY = 100;

function fullYear(year: string, now: number): number {
  const number = Number(year);

  if (year.length === 4) return number;

  const current = new Date(now).getUTCFullYear();
  const sameCentury = current - (current % CENTURY) + number;

  return sameCentury > current + HALF_CENTURY_YEARS ? sameCentury - CENTURY : sameCentury;
}

interface Fields {
  readonly year: number;
  readonly monthIndex: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function utcTime({ year, monthIndex, day, hour, minute, second }: Readonly<Fields>): number | null {
  const date = new Date(Date.UTC(year, monthIndex, day, hour, minute, second));

  const unchanged =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === monthIndex &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second;

  return unchanged ? date.getTime() : null;
}

function fieldsOf(
  groups: Readonly<Record<string, string | undefined>>,
  now: number,
): Fields | null {
  const { day, month, year, hour, minute, second } = groups;

  if (
    day === undefined ||
    month === undefined ||
    year === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    return null;
  }

  return {
    year: fullYear(year, now),
    monthIndex: MONTHS.indexOf(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
}

export function parseHttpDate(text: string, now: number): number | null {
  for (const form of FORMS) {
    const groups = form.exec(text)?.groups;
    const fields = groups === undefined ? null : fieldsOf(groups, now);

    if (fields !== null) return utcTime(fields);
  }

  return null;
}
