import { filled } from "./text.ts";

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : filled(many, { count: String(count) });
}
