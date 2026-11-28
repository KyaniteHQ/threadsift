import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { topicOverviewKind } from "../src/features/wiki/core/topic-overview-kind.ts";
import { accept, propose } from "./accept-fixtures.ts";
import { jobRow, openJobOf, selectGrokBot, sentTask } from "./bot-kinds-fixtures.ts";
import { applied } from "./bot-task-lifecycle.ts";
import { endsStale, inInstance, waitingOn, waitsForBot } from "./bot-wait-fixtures.ts";
import { seedDigested, seedTopics } from "./disagreement-fixtures.ts";
import type { Instance } from "./instance.ts";
import { paste, until } from "./library-fixtures.ts";
import { proposeTopics } from "./topic-accept-fixtures.ts";

const tagItems = (instance: Instance, name: string): number =>
  instance.database.count(
    "select count(*) as n from item_tags join tags on tags.id = item_tags.tag_id where tags.name = ?",
    name,
  );

describe("a catalog write that moves the input of a job waiting on the Grok Bot makes that job due", () => {
  it("retiring a sent Tag that no Item carries any more ends the stale task of the waiting Proposals job", () =>
    inInstance(async (instance) => {
      const carrier = await paste(instance, "llm", { title: "LLM notes", tags: ["llm"] });

      await paste(instance, "llms", { title: "LLMs", tags: ["llms"] });

      const owner = await paste(instance, "games", { title: "Games", tags: ["games"] });
      const sent = await sentTask(
        instance,
        await openJobOf(instance, { kind: "proposals", itemId: owner }),
      );

      await waitingOn(instance, sent.job);
      await paste(instance, "llm", { title: "LLM notes", tags: ["language models"] });
      await until(
        "the Tag llm has lost its last Item",
        () => tagItems(instance, "llm"),
        (count) => count === 0,
      );
      await until(
        "the Proposals job waits on its task again",
        () => jobRow(instance, sent.job.id),
        waitsForBot,
      );
      assert.notEqual(carrier, owner);

      const answer = await accept(instance, propose(instance, ["llm", "llms"]));

      assert.ok(answer.status < 300, answer.body);
      await endsStale(instance, sent.id);
    }));

  it("retiring a sent Topic ends the stale task of the waiting Topic proposals job", () =>
    inInstance(async (instance) => {
      await paste(instance, "llm", { title: "LLM notes", topic: "LLM" });
      await paste(instance, "llms", { title: "LLMs", topic: "LLMs" });

      const owner = await paste(instance, "games", { title: "Games", topic: "Games" });
      const sent = await sentTask(
        instance,
        await openJobOf(instance, { kind: "topic_proposals", itemId: owner }),
      );

      await waitingOn(instance, sent.job);

      const answer = await accept(instance, proposeTopics(instance, ["LLM", "LLMs"]));

      assert.ok(answer.status < 300, answer.body);
      await endsStale(instance, sent.id);
    }));

  it("a new Digest of an Item in a sent Topic ends the stale task of the waiting disagreement check", () =>
    inInstance(async (instance) => {
      seedTopics(instance, { 1: "Alpha" });
      seedDigested(instance, [
        { id: 201, topic: 1 },
        { id: 202, topic: 1 },
      ]);

      const sent = await sentTask(
        instance,
        await openJobOf(instance, { kind: "disagreement_proposals", itemId: 201 }),
      );

      await waitingOn(instance, sent.job);
      await paste(instance, "202", {
        title: "Title 202, revised",
        topic: "Alpha",
        url: "https://example.com/202",
      });
      await endsStale(instance, sent.id);
    }));

  it("a Topic page another overview job stores ends the stale task of the overview job waiting on the same Topic", () =>
    inInstance(async (instance) => {
      seedTopics(instance, { 1: "Alpha" });
      seedDigested(instance, [
        { id: 101, topic: 1 },
        { id: 102, topic: null },
        { id: 103, topic: null },
        { id: 104, topic: 1 },
      ]);
      instance.database.exec(
        "insert into topic_pages (topic_id, overview, revision, built_from, updated_at) values (1, 'Alpha covers lattices.', 1, json_array(json_object('item', 101, 'digest', 101), json_object('item', 103, 'digest', 103), json_object('item', 104, 'digest', 104)), 1)",
      );
      await selectGrokBot(instance);

      const keeper = await openJobOf(instance, { kind: "topic_overview", itemId: 104 });
      const kept = await topicOverviewKind.attempt(instance.core, keeper);

      instance.database.exec("update items set topic_id = 1 where id = 102");

      const sent = await sentTask(
        instance,
        await openJobOf(instance, { kind: "topic_overview", itemId: 101 }),
      );

      await waitingOn(instance, sent.job);
      await applied(instance, keeper, kept);
      await endsStale(instance, sent.id);
    }));
});
