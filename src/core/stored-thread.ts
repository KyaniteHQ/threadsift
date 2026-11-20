import type { ParsedThread } from "./thread-parse.ts";

export interface StoredThread extends ParsedThread {
  readonly followUps?: number;
}

export type StoredParse =
  | { readonly kind: "thread"; readonly thread: StoredThread }
  | { readonly kind: "refused"; readonly reason: string };
