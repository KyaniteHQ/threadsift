import type { ReadState, Source } from "./kinds.ts";

export interface CountedName {
  readonly key: string;
  readonly name: string;
  readonly count: number;
}

export interface FilterCounts {
  readonly total: number;
  readonly unread: number;
  readonly sources: readonly { readonly key: Source; readonly count: number }[];
  readonly reads: readonly { readonly key: ReadState; readonly count: number }[];
  readonly topics: readonly CountedName[];
  readonly tags: readonly CountedName[];
}
