import { type RedditRef, redditRefOf, statusIdOf } from "./links.ts";

export type ThreadSource =
  | { readonly kind: "reddit"; readonly ref: RedditRef }
  | { readonly kind: "x"; readonly statusId: string }
  | { readonly kind: "none" };

export function threadSourceOf(absoluteUrl: string): ThreadSource {
  const ref = redditRefOf(absoluteUrl);

  if (ref !== null) return { kind: "reddit", ref };

  const statusId = statusIdOf(absoluteUrl);

  return statusId === null ? { kind: "none" } : { kind: "x", statusId };
}
