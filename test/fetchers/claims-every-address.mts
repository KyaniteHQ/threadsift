import type { Fetcher } from "../../src/core/fetcher.ts";
import { words } from "./words.mts";

export const asked: string[] = [];

export default {
  matches: (url) => {
    asked.push(url);

    return true;
  },
  fetch: () =>
    Promise.resolve({ markdown: words("ANYMARKER"), title: "From the catch-all plug-in" }),
} satisfies Fetcher;
