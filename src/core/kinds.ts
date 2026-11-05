export const SOURCES = ["reddit", "x", "github", "other"] as const;
export const KINDS = ["reddit-post", "reddit-comment", "x-post", "github-repo", "link"] as const;

export const THROTTLE_KINDS = ["setup", "login"] as const;

export type Source = (typeof SOURCES)[number];

export type Kind = (typeof KINDS)[number];

export type ThrottleKind = (typeof THROTTLE_KINDS)[number];
