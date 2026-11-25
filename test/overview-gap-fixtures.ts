import assert from "node:assert/strict";

import { z } from "zod";

import type { OverviewGapProposal, ProposalPage } from "../src/core/contract/proposal-contract.ts";
import type { Instance } from "./instance.ts";
import { inOrder, pasteInOrder } from "./library-fixtures.ts";
import { seedTopicItems } from "./pin-fixtures.ts";
import { seedProposal } from "./proposal-seed.ts";
import { topicId } from "./topic-accept-fixtures.ts";

const GapSchema = z.object({
  id: z.number(),
  topic_id: z.number(),
  state: z.string(),
  reason: z.string().nullable(),
});

export const gapRows = (instance: Instance) =>
  instance.database.rows(
    GapSchema,
    "select id, topic_id, state, reason from proposals join overview_gap_proposals on proposal_id = id order by id",
  );

export const gapTopics = (instance: Instance): readonly string[] =>
  instance.database
    .rows(
      z.object({ name: z.string() }),
      "select topics.name as name from proposals join overview_gap_proposals on proposal_id = proposals.id join topics on topics.id = topic_id order by proposals.id",
    )
    .map(({ name }) => name);

export function proposeGap(instance: Instance, topic: string, state = "open"): number {
  return seedProposal(
    instance,
    "overview-gap",
    { topicId: topicId(instance, topic) },
    { reason: "plain-check", state },
  );
}

export function pasteInto(instance: Instance, topic: string, slugs: readonly string[]) {
  return pasteInOrder(
    instance,
    slugs.map((slug) => [slug, { title: slug, topic }] as const),
  );
}

export async function pasteTopics(
  instance: Instance,
  topics: Readonly<Record<string, readonly string[]>>,
): Promise<Readonly<Record<string, readonly number[]>>> {
  const made: Record<string, readonly number[]> = {};

  await inOrder(Object.entries(topics), async ([topic, slugs]) => {
    made[topic] = await pasteInto(instance, topic, slugs);
  });

  return made;
}

export function addTopics(
  instance: Instance,
  topics: readonly Readonly<{ id: number; name: string; items: number; from: number }>[],
): void {
  topics.forEach(({ id, name, items, from }) => {
    instance.database.exec("insert into topics (id, name, key) values (?, ?, ?)", id, name, name);
    seedTopicItems(instance, { topicId: id, name, from, items });
  });
}

export function storePage(
  instance: Instance,
  topic: string,
  {
    builtFrom,
    overview = "An overview.",
    failure = null,
  }: Readonly<{ builtFrom: "all" | readonly number[]; failure?: string | null; overview?: string }>,
): void {
  const only = builtFrom === "all" ? "" : `and digests.item_id in (${builtFrom.join(", ")})`;

  instance.database.exec(
    `insert or replace into topic_pages (topic_id, overview, revision, built_from, failure, updated_at)
     select topics.id, ?, 1, coalesce((select json_group_array(json_object('item', digests.item_id, 'digest', digests.task_id)) from digests join items on items.id = digests.item_id where items.topic_id = topics.id ${only}), '[]'), ?, 1
     from topics where topics.name = ?`,
    overview,
    failure,
    topic,
  );
}

const OPEN_JOBS = {
  queued: "'queued', 0, 0, 9999999999999, null",
  running: "'running', 0, 0, 1, 9999999999999",
} as const;

export const overviewJobStatement = (
  itemId: number,
  state: keyof typeof OPEN_JOBS = "queued",
): string =>
  `insert into jobs (kind, item_id, address, state, attempts, stale_requeues, next_attempt_at, claim_expires) select 'topic_overview', id, original_url, ${OPEN_JOBS[state]} from items where id = ${String(itemId)}`;

export function queueOverview(
  instance: Instance,
  itemId: number,
  state: keyof typeof OPEN_JOBS = "queued",
): void {
  instance.database.exec(overviewJobStatement(itemId, state));
}

export const body = (error: string) => JSON.stringify({ error });

export const jobOwners = (instance: Instance) =>
  overviewJobs(instance).map(({ item_id }) => item_id);

export const rowStates = (instance: Instance) =>
  gapRows(instance).map(({ id, state }) => [id, state]);

export const overviewJobs = (instance: Instance) =>
  instance.database.rows(
    z.object({ id: z.number(), item_id: z.number(), state: z.string() }),
    "select id, item_id, state from jobs where kind = 'topic_overview' order by id",
  );

export const failureOf = (instance: Instance, topic: string): string | null | undefined =>
  instance.database.rows(
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
