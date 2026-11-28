import {
  MICROS_PER_USD,
  X_API_LOOKUP_WORST,
  X_API_POST_MICROS,
  X_API_USAGE_READ_MICROS,
  X_API_USER_MICROS,
  X_REFERENCE_TYPES,
} from "../src/core/contract/x-api-contract.ts";

export { MICROS_PER_USD } from "../src/core/contract/x-api-contract.ts";

export const REFERENCE_TYPES = X_REFERENCE_TYPES;

export const ASSUMED = {
  usageReadMicros: X_API_USAGE_READ_MICROS,
  usernameUsersPerPost: X_API_LOOKUP_WORST.users,
} as const;

export const PRICE_MICROS = {
  post: X_API_POST_MICROS,
  user: X_API_USER_MICROS,
  usageRead: ASSUMED.usageReadMicros,
} as const;

export const ASSUMPTIONS = [
  `A usage or balance read is counted at ${usd(ASSUMED.usageReadMicros)} USD, the highest charge on X's pricing page, because the page does not price the usage endpoints. The price of a usage read is not measured.`,
  `The username expansion is counted at ${ASSUMED.usernameUsersPerPost} users per post (the author and the authors of ${REFERENCE_TYPES} referenced posts), because the OpenAPI document does not describe it. Its bound is not measured.`,
  "Media, polls, places, topics and calls are not on X's price table, so they count 0.",
  "X bills a post or a user once per UTC day, so a second lookup of the same post on one day costs nothing and the counted spend can exceed the measured spend. S1's two lookups read the same post. S2 and S3 need posts not read earlier the same UTC day.",
] as const;

export const CEILING = { usdMicros: 2 * MICROS_PER_USD, posts: 400 } as const;

export type Caps = { readonly usdMicros: number; readonly posts: number };

export type Counts = {
  readonly posts: number;
  readonly includedPosts: number;
  readonly users: number;
  readonly media: number;
  readonly polls: number;
  readonly places: number;
  readonly topics: number;
  readonly calls: number;
  readonly errors: number;
  readonly usageReads: number;
};

export const NO_COUNTS: Counts = {
  posts: 0,
  includedPosts: 0,
  users: 0,
  media: 0,
  polls: 0,
  places: 0,
  topics: 0,
  calls: 0,
  errors: 0,
  usageReads: 0,
};

export function totalOf(all: readonly Counts[]): Counts {
  return all.reduce(
    (sum, next) => ({
      posts: sum.posts + next.posts,
      includedPosts: sum.includedPosts + next.includedPosts,
      users: sum.users + next.users,
      media: sum.media + next.media,
      polls: sum.polls + next.polls,
      places: sum.places + next.places,
      topics: sum.topics + next.topics,
      calls: sum.calls + next.calls,
      errors: sum.errors + next.errors,
      usageReads: sum.usageReads + next.usageReads,
    }),
    NO_COUNTS,
  );
}

export function billedPostsOf(counts: Counts): number {
  return counts.posts + counts.includedPosts;
}

export type Billed = { readonly posts: number; readonly users: number };

export function billedOf(counts: Counts): Billed {
  return { posts: billedPostsOf(counts), users: counts.users };
}

export function costOf(counts: Counts): number {
  return (
    billedPostsOf(counts) * PRICE_MICROS.post +
    counts.users * PRICE_MICROS.user +
    counts.usageReads * PRICE_MICROS.usageRead
  );
}

export function exceedsPlan(counted: Counts, planned: Counts): boolean {
  return billedPostsOf(counted) > billedPostsOf(planned) || counted.users > planned.users;
}

export function withinCaps(counts: Counts, caps: Caps): boolean {
  return costOf(counts) <= caps.usdMicros && billedPostsOf(counts) <= caps.posts;
}

export function usd(micros: number): string {
  return (micros / MICROS_PER_USD).toFixed(6);
}

export function capsRecord(caps: Caps) {
  return { usd: usd(caps.usdMicros), posts: caps.posts };
}
