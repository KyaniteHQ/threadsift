import type { Fetcher } from "../../src/core/kernel/fetcher.ts";

export default {
  matches: () => {
    throw new Error("this plug-in cannot decide");
  },
  fetch: () => Promise.reject(new Error("never reached")),
} satisfies Fetcher;
