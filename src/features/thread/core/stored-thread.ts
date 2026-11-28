import type { ParsedThread, ThreadParse } from "./thread-parse.ts";

export interface StoredThread extends ParsedThread {
  readonly followUps?: number;
  readonly xApiRead: boolean;
}

export type StoredParse =
  | { readonly kind: "thread"; readonly thread: StoredThread }
  | { readonly kind: "refused"; readonly reason: string };

export function readElsewhere(parse: ThreadParse): StoredParse {
  return parse.kind === "thread"
    ? { kind: "thread", thread: { ...parse.thread, xApiRead: false } }
    : parse;
}
