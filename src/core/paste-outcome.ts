import type { UNSUPPORTED_PAGE_LINK } from "./supplied-page.ts";

export interface Refused {
  readonly kind: "refused";
}

export interface Invalid<Field extends string> {
  readonly kind: "invalid";
  readonly field: Field;
  readonly reason: string;
  readonly code?: typeof UNSUPPORTED_PAGE_LINK;
}

export interface TooLarge<Field extends string> {
  readonly kind: "too-large";
  readonly field: Field;
}

export interface ThreadKept {
  readonly kind: "thread-kept";
}

export interface NotWaiting {
  readonly kind: "not-waiting";
}
