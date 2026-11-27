import { groupedNumber } from "../../src/core/contract/format.ts";
import { filled } from "./filled.ts";

export function plural(
  count: number,
  one: string,
  many: string,
  values: Readonly<Record<string, string>> = {},
): string {
  return filled(count === 1 ? one : many, { ...values, count: groupedNumber(count) });
}
