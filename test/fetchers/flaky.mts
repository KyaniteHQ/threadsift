import type { Fetcher } from "../../src/core/fetcher.ts";
import { hostOf, words } from "./words.mts";

let calls = 0;

export default {
  matches: (url) => hostOf(url) === "flaky.test",
  fetch: () => {
    calls += 1;

    return calls % 2 === 0
      ? Promise.reject(new Error("FLAKYMESSAGE the second answer fails"))
      : Promise.resolve({ markdown: words("FLAKYMARKER"), title: "Answers once" });
  },
} satisfies Fetcher;
