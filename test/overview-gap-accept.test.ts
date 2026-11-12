import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { accept } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { moveClaimBack, nextTick, proposalRows, readPage } from "./lost-highlight-fixtures.ts";
import {
  body,
  failureOf,
  gapRows,
  jobOwners,
  overviewJobs,
  pasteTopics,
  proposeGap,
  queueOverview,
  rowStates,
  storePage,
} from "./overview-gap-fixtures.ts";
import { SECRET_KEY, exec, rows, saveProvider, until } from "./related-fixtures.ts";

const reject = (instance: Instance, id: number) =>
  instance.send("POST", `/api/proposals/${String(id)}/reject`);

describe("Accept of an overview-gap row", () => {
  let instance: Instance;
  let token: string;
  let made: Readonly<Record<string, readonly number[]>>;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    made = await pasteTopics(instance, {
      Started: ["a1", "a2"],
      Providerless: ["p1"],
      Busy: ["b1", "b2"],
      Done: ["d1", "d2"],
      Decided: ["x1"],
    });
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "overview-gap",
    }));
  });

  after(() => instance.close());

  it("starts one run owned by the Topic's newest Item with a Digest, deletes the row, and the run reaches no model and its task fails as unreachable", async () => {
    const [first, newest] = made["Started"] ?? [];

    assert.ok(first !== undefined && newest !== undefined);
    storePage(instance, "Started", { builtFrom: [first], failure: "gave-up" });

    const id = proposeGap(instance, "Started");

    await saveProvider(instance);

    const answer = await accept(instance, id);

    assert.deepEqual([answer.status, answer.body], [200, JSON.stringify({ state: "done" })]);
    assert.deepEqual(jobOwners(instance), [newest]);
    assert.deepEqual(gapRows(instance), []);
    assert.equal((await accept(instance, id)).status, 404);

    const [task] = await until(
      () =>
        rows(
          instance,
          z.object({ state: z.string(), refusal: z.string().nullable() }),
          "select state, refusal from ai_tasks where kind = 'topic_overview' and state <> 'running'",
        ),
      (tasks) => tasks.length > 0,
    );

    assert.deepEqual(task, { state: "failed", refusal: "unreachable" });
    assert.equal(overviewJobs(instance).length, 1);
  });

  it("answers 409 no-provider with no Provider saved, and leaves the row, the marker and the jobs", async () => {
    storePage(instance, "Providerless", { builtFrom: [], failure: "gave-up" });
    exec(instance, "delete from settings");

    const id = proposeGap(instance, "Providerless");
    const jobs = overviewJobs(instance);
    const answer = await accept(instance, id);

    assert.deepEqual([answer.status, answer.body], [409, body("no-provider")]);
    assert.deepEqual(overviewJobs(instance), jobs);
    assert.equal(failureOf(instance, "Providerless"), "gave-up");
    assert.deepEqual(rowStates(instance).at(-1), [id, "open"]);
    exec(instance, "delete from proposals");
  });

  it("answers 409 not-current when a queued run is open on another Item of the Topic, with no second job", async () => {
    await saveProvider(instance);

    const [oldest] = made["Busy"] ?? [];

    assert.ok(oldest !== undefined);
    queueOverview(instance, oldest);

    const id = proposeGap(instance, "Busy");
    const jobs = overviewJobs(instance);
    const answer = await accept(instance, id);

    assert.deepEqual([answer.status, answer.body], [409, body("not-current")]);
    assert.deepEqual(overviewJobs(instance), jobs);
    assert.deepEqual(rowStates(instance), [[id, "open"]]);
    assert.deepEqual((await readPage(instance)).proposals, []);
    exec(instance, "delete from proposals");
  });

  it("answers 409 not-current when every Item with a Digest is in the overview", async () => {
    storePage(instance, "Done", { builtFrom: "all" });

    const id = proposeGap(instance, "Done");
    const jobs = overviewJobs(instance);
    const answer = await accept(instance, id);

    assert.deepEqual([answer.status, answer.body], [409, body("not-current")]);
    assert.deepEqual(overviewJobs(instance), jobs);
    assert.deepEqual(rowStates(instance), [[id, "open"]]);
    exec(instance, "delete from proposals");
  });

  it("answers 409 not-open for a rejected row, and 403 to a token, 401 signed out and 404 for an unknown id", async () => {
    const id = proposeGap(instance, "Decided", "rejected");
    const open = proposeGap(instance, "Done");
    const path = `/api/proposals/${String(open)}/accept`;
    const jobs = overviewJobs(instance);

    assert.deepEqual(
      [await accept(instance, id), await accept(instance, 999_999)].map(
        ({ status, body: text }) => [status, text],
      ),
      [
        [409, body("not-open")],
        [404, body("Not found")],
      ],
    );
    assert.deepEqual(
      [
        (await instance.sendWithToken(token, "POST", path)).status,
        (await instance.fetch(path, { method: "POST" })).status,
      ],
      [403, 401],
    );
    assert.deepEqual(overviewJobs(instance), jobs);
    assert.deepEqual(
      rowStates(instance).map(([, state]) => state),
      ["rejected", "open"],
    );
    exec(instance, "delete from proposals");
  });
});

describe("Reject of an overview-gap row", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await pasteTopics(instance, { Declined: ["d1", "d2"] });
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("moves the row to rejected, lists it no more, and never proposes the Topic again", async () => {
    const id = proposeGap(instance, "Declined");

    assert.deepEqual(await reject(instance, id).then(({ status, body: text }) => [status, text]), [
      200,
      JSON.stringify({ state: "rejected" }),
    ]);
    assert.deepEqual(await reject(instance, id).then(({ status, body: text }) => [status, text]), [
      409,
      body("not-open"),
    ]);
    assert.deepEqual((await readPage(instance)).proposals, []);

    await nextTick(instance);
    moveClaimBack(instance, "overview_proposals");
    await nextTick(instance);

    assert.deepEqual(
      proposalRows(instance).filter(({ kind }) => kind === "overview-gap"),
      [{ id, kind: "overview-gap", state: "rejected" }],
    );
  });
});
