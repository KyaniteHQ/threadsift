import type { Fetcher } from "../../src/core/kernel/fetcher.ts";
import { hostOf } from "./words.mts";

export default {
  matches: (url) => hostOf(url) === "short.test",
  fetch: (url) =>
    Promise.resolve({
      markdown: "word ".repeat(new URL(url).pathname === "/100" ? 100 : 99).trimEnd(),
      title: "A short page",
    }),
} satisfies Fetcher;
