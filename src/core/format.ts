const GROUPED = new Intl.NumberFormat("en-US");

export function groupedNumber(value: number): string {
  return GROUPED.format(value);
}
