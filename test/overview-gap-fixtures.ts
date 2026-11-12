import assert from "node:assert/strict";

import { z } from "zod";

import type { OverviewGapProposal, ProposalPage } from "../src/core/proposal-contract.ts";
import type { Instance } from "./instance.ts";
import { seedTopicItems } from "./pin-fixtures.ts";
import { exec, paste, rows } from "./related-fixtures.ts";
import { topicId } from "./topic-accept-fixtures.ts";

const GapSchema = z.object({
  id: z.number(),
  topic_id: z.number(),
  state: z.string(),
  reason: z.string().nullable(),
});

const IdSchema = z.object({ id: z.number() });

export const gapRows = (instance: Instance) =>
  rows(
    instance,
    GapSchema,
    "select id, topic_id, state, reason from proposals where kind = 'overview-gap' order by id",
  );

export const gapTopics = (instance: Instance): readonly string[] =>
  rows(
    instance,
    z.object({ name: z.string() }),
    "select topics.name as name from proposals join topics on topics.id = proposals.topic_id where proposals.kind = 'overview-gap' order by proposals.id",
  ).map(({ name }) => name);

export function proposeGap(instance: Instance, topic: string, state = "open"): number {
  exec(
    instance,
    "insert into proposals (kind, topic_id, reason, state, created_at) values ('overview-gap', ?, 'plain-check', ?, 1)",
    topicId(instance, topic),
    state,
  );

  const [row] = rows(instance, IdSchema, "select max(id) as id from proposals");

  if (row === undefined) throw new Error("no Proposal was stored");

  return row.id;
}

export function pasteInto(instance: Instance, topic: string, slugs: readonly string[]) {
  return slugs.reduce<Promise<readonly number[]>>(
    async (done, slug) => [...(await done), await paste(instance, slug, { title: slug, topic })],
    Promise.resolve([]),
  );
}

export async function pasteTopics(
  instance: Instance,
  topics: Readonly<Record<string, readonly string[]>>,
): Promise<Readonly<Record<string, readonly number[]>>> {
  const made = await Object.entries(topics).reduce<
    Promise<readonly (readonly [string, readonly number[]])[]>
  >(
    async (done, [topic, slugs]) => [
      ...(await done),
      [topic, await pasteInto(instance, topic, slugs)],
    ],
    Promise.resolve([]),
  );

  return Object.fromEntries(made);
}

export function addTopics(
  instance: Instance,
  topics: readonly Readonly<{ id: number; name: string; items: number; from: number }>[],
): void {
  topics.forEach(({ id, name, items, from }) => {
    exec(instance, "insert into topics (id, name, key) values (?, ?, ?)", id, name, name);
    seedTopicItems(instance, { topicId: id, name, from, items });
  });
}

export function storePage(
  instance: Instance,
  topic: string,
  {
    builtFrom,
    failure = null,
  }: Readonly<{ builtFrom: "all" | readonly number[]; failure?: string | null }>,
): void {
  const only = builtFrom === "all" ? "" : `and digests.item_id in (${builtFrom.join(", ")})`;

  exec(
    instance,
    `insert or replace into topic_pages (topic_id, overview, revision, built_from, failure, updated_at)
     select topics.id, 'An overview.', 1, coalesce((select json_group_array(json_object('item', digests.item_id, 'digest', digests.task_id)) from digests join items on items.id = digests.item_id where items.topic_id = topics.id ${only}), '[]'), ?, 1
     from topics where topics.name = ?`,
    failure,
    topic,
  );
}

export function queueOverview(instance: Instance, itemId: number): void {
  exec(
    instance,
    "insert into jobs (kind, item_id, address, state, attempts, stale_requeues, next_attempt_at) select 'topic_overview', id, original_url, 'queued', 0, 0, 9999999999999 from items where id = ?",
    itemId,
  );
}

export const overviewJobs = (instance: Instance) =>
  rows(
    instance,
    z.object({ id: z.number(), item_id: z.number(), state: z.string() }),
    "select id, item_id, state from jobs where kind = 'topic_overview' order by id",
  );

export const failureOf = (instance: Instance, topic: string): string | null | undefined =>
  rows(
    instance,
    z.object({ failure: z.string().nullable() }),
    "select topic_pages.failure as failure from topic_pages join topics on topics.id = topic_pages.topic_id where topics.name = ?",
    topic,
  )[0]?.failure;

export function gapsOf(page: Readonly<ProposalPage>): readonly OverviewGapProposal[] {
  return page.proposals.filter((row) => row.kind === "overview-gap");
}

export function sole(gaps: readonly OverviewGapProposal[]): OverviewGapProposal {
  const [first, ...rest] = gaps;

  assert.ok(first !== undefined && rest.length === 0, "one overview-gap row is listed");

  return first;
}
