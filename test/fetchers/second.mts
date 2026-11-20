import type { Fetcher } from "../../src/core/kernel/fetcher.ts";
import { hostOf, words } from "./words.mts";

const HOSTS = new Set(["second.test", "shared.test"]);

export default {
  matches: (url) => HOSTS.has(hostOf(url)),
  fetch: () =>
    Promise.resolve({ markdown: words("SECONDMARKER"), title: "From the second plug-in" }),
} satisfies Fetcher;
