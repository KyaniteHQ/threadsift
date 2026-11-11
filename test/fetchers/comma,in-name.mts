import type { Fetcher } from "../../src/core/fetcher.ts";
import { hostOf, words } from "./words.mts";

export default {
  matches: (url) => hostOf(url) === "comma.test",
  fetch: () =>
    Promise.resolve({ markdown: words("COMMAMARKER"), title: "From a file with a comma" }),
} satisfies Fetcher;
