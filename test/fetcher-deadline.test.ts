import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { pluginPage } from "../src/core/plugin-fetch.ts";
import { loadFetchers } from "../src/targets/node/fetcher-modules.ts";
import { fetcherFile, recordOf } from "./fetcher-record.ts";

const MODULE = fetcherFile("deadline.mts");

const DEADLINE_MS = 300;

const SETTLE_MS = 400;

describe("a plug-in that does not answer before the fetch deadline ends the fetch as a timeout and publishes nothing later", () => {
  const fetchers = loadFetchers(MODULE);

  const calls = () => recordOf(MODULE, "calls");

  it("answers timeout when the promise never settles, and again for an answer or a rejection that arrives after the deadline", async () => {
    const unhandled: Error[] = [];

    process.on("unhandledRejection", (reason: Error) => {
      unhandled.push(reason);
    });

    const results = await Promise.all(
      ["/never", "/late-answer", "/late-reject"].map(async (path) =>
        pluginPage(
          await fetchers,
          `https://deadline.test${path}`,
          AbortSignal.timeout(DEADLINE_MS),
        ),
      ),
    );

    assert.deepEqual(results, [
      { kind: "failed", status: "timeout" },
      { kind: "failed", status: "timeout" },
      { kind: "failed", status: "timeout" },
    ]);

    await delay(SETTLE_MS);

    assert.deepEqual(unhandled, []);
  });

  it("does not call the plug-in when the deadline has already passed", async () => {
    const before = (await calls()).length;

    const result = await pluginPage(
      await fetchers,
      "https://deadline.test/never",
      AbortSignal.abort(),
    );

    assert.deepEqual(result, { kind: "failed", status: "timeout" });
    assert.equal((await calls()).length, before);
  });

  it("treats an AbortError thrown while the deadline is still open as a plug-in failure, not a timeout", async () => {
    const result = await pluginPage(
      await fetchers,
      "https://deadline.test/abort-error",
      AbortSignal.timeout(60_000),
    );

    assert.deepEqual(result, { kind: "failed", status: "unreadable" });
  });
});
