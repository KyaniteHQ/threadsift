import { utf8Length } from "./digest-prompt.ts";

export interface ThreadNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly position: number;
  readonly depth: number;
  readonly kind: "comment" | "more";
  readonly author: string | null;
  readonly body: string | null;
  readonly score: number | null;
  readonly postedAt: number | null;
  readonly eligible: boolean;
}

export const STATEMENT_JSON_BYTES = 1_500_000;

const BRACKETS = 2;

const SEPARATOR = 1;

export const MAX_ROW_BYTES = STATEMENT_JSON_BYTES - BRACKETS;

export function rowJson(node: Readonly<ThreadNode>): string {
  return JSON.stringify({ ...node, eligible: node.eligible ? 1 : 0 });
}

export function rowFits(node: Readonly<ThreadNode>): boolean {
  return utf8Length(rowJson(node)) <= MAX_ROW_BYTES;
}

export function jsonArrays(elements: readonly string[]): readonly string[] {
  const arrays: string[][] = [];
  let bytes = 0;

  for (const element of elements) {
    const size = utf8Length(element);
    const open = arrays.at(-1);

    if (open === undefined || bytes + SEPARATOR + size > STATEMENT_JSON_BYTES) {
      arrays.push([element]);
      bytes = BRACKETS + size;
    } else {
      open.push(element);
      bytes += SEPARATOR + size;
    }
  }

  return arrays.map((array) => `[${array.join(",")}]`);
}
