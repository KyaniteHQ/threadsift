import type { Fetcher } from "../../src/core/kernel/fetcher.ts";
import first from "./first.mts";

export const calls: string[] = [];

export default {
  matches: first.matches,
  fetch: (url) => {
    calls.push(url);
    return first.fetch();
  },
} satisfies Fetcher;
