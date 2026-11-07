import { expect } from "@playwright/test";
import { z } from "zod";

import { createToken, expectRefusal } from "./access-helpers.ts";
import { bearer } from "./access.ts";
import { countRows } from "./ai.ts";
import { itemOf, listAll, postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { pasteBehindDeferredFetch, sweepNow } from "./ingest.ts";

export const SENT_DIGEST = {
  title: "Caller title",
  topic: "Reading",
  tags: ["Machine learning"],
  summary: "A caller supplies this Digest.",
  keyPoints: ["The caller chooses the names."],
} as const;

let sequence = 0;

export function callerTasks(screen: FreshScreen) {
  return screen.fresh.query(
    "SELECT t.executor, t.state, t.item_id AS itemId, d.item_id AS digestItemId FROM ai_tasks t LEFT JOIN digests d ON d.task_id = t.id",
    z.array(
      z.object({
        executor: z.string(),
        state: z.string(),
        itemId: z.number().nullable(),
        digestItemId: z.number().nullable(),
      }),
    ),
  );
}

export function expectOwned(tasks: ReturnType<typeof callerTasks>): void {
  expect(
    tasks.every(
      (task) => task.itemId !== null && (task.digestItemId ?? task.itemId) === task.itemId,
    ),
    "every task names its Item, and a stored Digest's task names the Digest's Item",
  ).toBe(true);
}

export function catalogCounts(screen: FreshScreen) {
  return screen.fresh.query(
    "SELECT (SELECT count(*) FROM topics) AS topics, (SELECT count(*) FROM tags) AS tags, coalesce((SELECT version FROM catalog_version WHERE id = 1), 0) AS version, (SELECT count(*) FROM item_tags) AS links",
    z.array(
      z.object({ topics: z.number(), tags: z.number(), version: z.number(), links: z.number() }),
    ),
  )[0];
}

export function topicLink(screen: FreshScreen, id: number) {
  return screen.fresh.query(
    `SELECT topic_id AS topicId FROM items WHERE id = ${id}`,
    z.array(z.object({ topicId: z.number().nullable() })),
  )[0]?.topicId;
}

export async function agentHeaders(screen: FreshScreen) {
  const { value } = await createToken(screen.context.request, "Caller Digest proof");

  return bearer(value);
}

export async function sendDigest(
  screen: FreshScreen,
  url: string,
  options: Readonly<{
    tags: readonly string[];
    topic?: string;
    headers?: Readonly<Record<string, string>>;
  }>,
) {
  sequence += 1;

  const digest = {
    ...SENT_DIGEST,
    title: `Caller title ${sequence}`,
    topic: options.topic ?? "Reading",
    tags: options.tags,
  };

  const { status, body: saved } = await postLinkRaw(
    screen.context.request,
    url,
    digest,
    options.headers,
  );

  expect(status).toBeLessThan(300);
  const item = await settled(screen.context.request, saved.item.id);
  expect(item).toMatchObject({ digestTitle: digest.title, digestOutcome: "none" });

  return item;
}

export async function invalidDigests(screen: FreshScreen): Promise<void> {
  const { title: _title, ...missingTitle } = SENT_DIGEST;

  for (const digest of [{ ...SENT_DIGEST, tags: ["a", "b", "c", "d"] }, missingTitle]) {
    const answer = await screen.context.request.post("/api/items", {
      data: { url: ESSAY, digest },
    });

    await expectRefusal(answer, 400, "invalid Digest");
    expect(countRows(screen, "items")).toBe(0);
  }
}

export function unlinkDigests(screen: FreshScreen, ids: readonly number[]): void {
  screen.fresh.sql(
    `UPDATE items SET topic_id = NULL WHERE id IN (${ids.join(",")}); DELETE FROM item_tags WHERE item_id IN (${ids.join(",")})`,
  );
}

async function expectTopic(screen: FreshScreen, id: number, topic: string): Promise<void> {
  expect((await itemOf(screen.context.request, id)).digestTopic).toBe(topic);
  expect((await listAll(screen.context.request)).find((row) => row.id === id)?.digestTopic).toBe(
    topic,
  );
}

export async function proveLegacyTopic(screen: FreshScreen, id: number): Promise<void> {
  unlinkDigests(screen, [id]);
  await expectTopic(screen, id, "reading");
  await sweepNow(screen.context.request, screen.fresh);
  await expect.poll(() => topicLink(screen, id), { timeout: 90_000 }).not.toBeNull();
  await expectTopic(screen, id, "Reading");
}

export async function proveLastPaste(
  screen: FreshScreen,
  id: number,
  title: string,
): Promise<void> {
  await pasteBehindDeferredFetch(screen, async () => {
    expect(
      (
        await postLinkRaw(screen.context.request, ESSAY, {
          ...SENT_DIGEST,
          title: "Superseded title",
        })
      ).status,
    ).toBe(200);
    await postLinkRaw(screen.context.request, ESSAY);

    return [id];
  });
  expect((await settled(screen.context.request, id)).digestTitle).toBe(title);
  expect(countRows(screen, "ai_tasks")).toBe(5);

  const { body: saved } = await postLinkRaw(
    screen.context.request,
    "https://x.com/threadsift/status/12345",
    SENT_DIGEST,
  );

  expect((await settled(screen.context.request, saved.item.id)).digestTitle).toBeNull();
  await pasteBehindDeferredFetch(screen, async () => {
    await postLinkRaw(screen.context.request, ESSAY, {
      ...SENT_DIGEST,
      title: "Retry must discard this",
    });
    expect(
      (await screen.context.request.post(`/api/items/${id}/digest`, { data: {} })).status(),
    ).toBe(200);

    const pending = screen.fresh.query(
      `SELECT pending_digest AS pending FROM items WHERE id = ${id}`,
      z.array(z.object({ pending: z.string().nullable() })),
    );

    expect(pending).toEqual([{ pending: null }]);

    return [id];
  });
  expect((await settled(screen.context.request, id)).digestTitle).toBe(title);
  expect(countRows(screen, "ai_tasks")).toBe(5);
}
