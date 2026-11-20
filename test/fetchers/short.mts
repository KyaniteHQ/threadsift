import type { Fetcher } from "../../src/core/kernel/fetcher.ts";
import { hostOf } from "./words.mts";

export default {
  matches: (url) => hostOf(url) === "short.test",
  fetch: () => Promise.resolve({ markdown: "Only a few words of text.", title: "A short page" }),
} satisfies Fetcher;
