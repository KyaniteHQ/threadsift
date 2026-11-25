import assert from "node:assert/strict";
import { once } from "node:events";
import { describe, it } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";

import { pluginPage } from "../src/features/fetch/core/plugin-fetch.ts";
import { loadFetchers } from "../src/targets/node/fetcher-modules.ts";
import { fetcherFile, recordOf } from "./fetcher-record.ts";
import { activity } from "./fetchers/deadline.mts";
import { SETTLE_DEADLINE_MS } from "./library-fixtures.ts";

const MODULE = fetcherFile("deadline.mts");

describe("a plug-in that does not answer before the fetch deadline ends the fetch as a timeout and publishes nothing later", () => {
  const fetchers = loadFetchers(MODULE);

  const calls = () => recordOf(MODULE, "calls");

  const asked = () => recordOf(MODULE, "asked");

  it("answers timeout when the promise never settles, and again for an answer or a rejection that arrives after the deadline", async (t) => {
    const unhandled: Error[] = [];

    const recordRejection = (reason: Error) => {
      unhandled.push(reason);
    };

    process.on("unhandledRejection", recordRejection);
    t.after(() => {
      process.off("unhandledRejection", recordRejection);
    });

    const paths = ["/never", "/late-answer", "/late-reject"];
    const controller = new AbortController();
    const signal = AbortSignal.timeout(SETTLE_DEADLINE_MS);
    const entered = Promise.all(paths.map((path) => once(activity, path, { signal })));
    const plugins = await fetchers;
    const pending = Promise.all(
      paths.map((path) => pluginPage(plugins, `https://deadline.test${path}`, controller.signal)),
    );
    await entered;
    assert.deepEqual([...(await calls())].toSorted(), paths.toSorted());
    const settled = Promise.all(
      ["settled/late-answer", "settled/late-reject"].map((event) =>
        once(activity, event, { signal }),
      ),
    );
    controller.abort();
    const [results] = await Promise.all([pending, settled]);

    assert.deepEqual(results, [
      { kind: "failed", status: "timeout" },
      { kind: "failed", status: "timeout" },
      { kind: "failed", status: "timeout" },
    ]);

    await nextTurn();

    assert.deepEqual(unhandled, []);
  });

  it("calls neither a matcher nor a fetch when the deadline has already passed, including with an empty plug-in list or an earlier matcher that throws", async () => {
    const throwing = await loadFetchers(`${fetcherFile("throws-on-every-address.mts")},${MODULE}`);
    const matchersBefore = (await asked()).length;
    const fetchesBefore = (await calls()).length;

    const results = await Promise.all([
      pluginPage(await fetchers, "https://deadline.test/never", AbortSignal.abort()),
      pluginPage([], "https://deadline.test/never", AbortSignal.abort()),
      pluginPage(throwing, "https://deadline.test/never", AbortSignal.abort()),
    ]);

    assert.deepEqual(results, [
      { kind: "failed", status: "timeout" },
      { kind: "failed", status: "timeout" },
      { kind: "failed", status: "timeout" },
    ]);
    assert.equal((await asked()).length, matchersBefore);
    assert.equal((await calls()).length, fetchesBefore);
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
