import type { Fetcher } from "../../src/core/fetcher.ts";
import { hostOf, words } from "./words.mts";

const HOSTS = new Set(["first.test", "shared.test"]);

export default {
  matches: (url) => HOSTS.has(hostOf(url)),
  fetch: () => Promise.resolve({ markdown: words("FIRSTMARKER"), title: "From the first plug-in" }),
} satisfies Fetcher;
