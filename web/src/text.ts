import type { Source } from "../../src/core/kinds.ts";

export const PASTE_LABEL = "Paste a link to save";
export const PASTE_PLACEHOLDER = "Paste a link";
export const ADD_LABEL = "Add";

export const REFUSALS = {
  empty: "Paste a link first.",
  invalid: "That doesn't look like a link.",
  failed: "Couldn’t save this link.",
} as const;

export const LOAD_FAILED = "Couldn’t load your saved links.";

export const EMPTY_LIST = {
  heading: "Nothing saved yet",
  line: "Paste a link in the box and press Add.",
} as const;

export const SOURCE_LABELS: Readonly<Record<Source, string>> = {
  reddit: "Reddit",
  x: "X",
  github: "GitHub",
  other: "Other",
};
