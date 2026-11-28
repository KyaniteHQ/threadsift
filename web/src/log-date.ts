const pad = (value: number): string => String(value).padStart(2, "0");

function calendarDate(day: Readonly<Date>): string {
  return `${String(day.getFullYear())}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

export function localDate(at: number): string {
  return calendarDate(new Date(at));
}

export function localTime(at: number): string {
  const day = new Date(at);

  return `${pad(day.getHours())}:${pad(day.getMinutes())}`;
}
