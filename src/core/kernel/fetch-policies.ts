import { isRedditOrXLink, isShortLink } from "../contract/links.ts";
import type { BodyUse, FetchPolicy } from "./fetch-guard.ts";

export const followingShortLinks =
  (others: BodyUse) =>
  (url: string): BodyUse =>
    isShortLink(url) ? "follow-refresh" : others;

export const SMALL_POLICY: FetchPolicy = {
  stopAt: isRedditOrXLink,
  body: followingShortLinks("read"),
};
