import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { accept, propose } from "./accept-fixtures.ts";
import { jobRow, openJobOf, sentTask, taskRow } from "./bot-kinds-fixtures.ts";
import { answerOf, picksFor, relatedLibrary, unblock } from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { applied, sentRelatedTask, step } from "./bot-task-lifecycle.ts";
import { endsStale, inInstance, waitingOn } from "./bot-wait-fixtures.ts";
import type { Instance } from "./instance.ts";
import { paste, until } from "./library-fixtures.ts";
import { proposeTopics } from "./topic-accept-fixtures.ts";

const REFETCHED = Array.from(
  { length: 6 },
  () => "The second version of the page explains how the quasar lattice decoder recovers.",
).join("\n\n");

async function waitingPick(
  instance: Instance,
  secondCandidate: Readonly<Partial<Parameters<typeof paste>[2]>> = {},
) {
  const library = await relatedLibrary(instance, secondCandidate);
  const sent = await sentRelatedTask(instance, library.source);

  await waitingOn(instance, sent.job);
  unblock(instance, library.source);

  return { library, taskId: sent.id };
}

async function accepted(instance: Instance, proposal: number): Promise<void> {
  const answer = await accept(instance, proposal);

  assert.ok(answer.status < 300, answer.body);
}

describe("a write that moves the input of a job waiting on the Grok Bot makes that job due", () => {
  it("new content fetched for an Item ends the stale task of its waiting Digest job", () =>
    inInstance(async (instance) => {
      const itemId = await paste(instance, "page", {
        title: "A page",
        postText: "The first version.",
        noDigest: true,
      });
      const sent = await sentTask(instance, await openJobOf(instance, { kind: "digest", itemId }));

      await waitingOn(instance, sent.job);

      const refetched = await instance.send("POST", "/api/items", {
        url: "https://example.com/related/page",
        page: { markdown: REFETCHED, title: "A page" },
      });

      assert.ok(refetched.status < 300, refetched.body);
      await endsStale(instance, sent.id);
    }));

  it("a new Digest of a sent candidate ends the stale task of the waiting Related pick", () =>
    inInstance(async (instance) => {
      const { taskId } = await waitingPick(instance);

      await paste(instance, "near-two", { title: "Quasar notes, revised", tags: ["quasar"] });
      await endsStale(instance, taskId);
    }));

  it("deleting a sent candidate ends the stale task of the waiting Related pick", () =>
    inInstance(async (instance) => {
      const { library, taskId } = await waitingPick(instance);

      const deleted = await instance.send("DELETE", `/api/items/${String(library.candidates[1])}`);

      assert.equal(deleted.status, 204, deleted.body);
      await endsStale(instance, taskId);
    }));

  it("a Tag merge that rewrites a sent candidate's Digest ends the stale task of the waiting Related pick", () =>
    inInstance(async (instance) => {
      const { taskId } = await waitingPick(instance, { tags: ["quasar", "lattice"] });

      await accepted(instance, propose(instance, ["lattice", "quasar"]));
      await endsStale(instance, taskId);
    }));

  it("a Topic merge that moves a sent candidate ends the stale task of the waiting Related pick", () =>
    inInstance(async (instance) => {
      const { taskId } = await waitingPick(instance, { topic: "Lattices" });

      await accepted(instance, proposeTopics(instance, ["Lattices", "Reading"]));
      await endsStale(instance, taskId);
    }));

  it("a stored Digest leaves the due time of a job whose task the bot has answered", () =>
    inInstance(async (instance) => {
      const library = await relatedLibrary(instance);
      const sent = await sentRelatedTask(instance, library.source);

      await waitingOn(instance, sent.job);

      const answer = await answered(instance, sent, answerOf(picksFor(library.candidates[0])));

      assert.equal(answer.status, 204, answer.text);

      const due = jobRow(instance, sent.job.id).next_attempt_at;
      const other = await paste(instance, "other", { title: "Garden soil", tags: ["soil"] });

      await until(
        "the other Item holds its Digest",
        () => instance.database.count("select count(*) as n from digests where item_id = ?", other),
        (stored) => stored === 1,
      );
      assert.equal(jobRow(instance, sent.job.id).next_attempt_at, due);
    }));

  it("an input that moves after the attempt read it and before its deferral commits leaves the job due at once", () =>
    inInstance(async (instance) => {
      const library = await relatedLibrary(instance);
      const sent = await sentRelatedTask(instance, library.source);
      const deferral = await step(instance, sent.job);
      const [, revised] = library.candidates;

      await paste(instance, "near-two", { title: "Quasar notes, revised", tags: ["quasar"] });
      await until(
        "the sent candidate holds its new Digest",
        () =>
          instance.database.count(
            "select count(*) as n from digests where item_id = ? and title = 'Quasar notes, revised'",
            revised,
          ),
        (stored) => stored === 1,
      );

      const committed = Date.now();

      await applied(instance, sent.job, deferral);

      const job = jobRow(instance, sent.job.id);

      assert.equal(job.state, "queued");
      assert.ok(job.next_attempt_at <= committed + 1000, JSON.stringify(job));
      assert.ok(job.next_attempt_at < taskRow(instance, sent.id).deadline);
    }));
});
