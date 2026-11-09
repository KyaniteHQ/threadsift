import { type TestInfo, expect } from "@playwright/test";
import { z } from "zod";

import { AiSettingsViewSchema, DigestSchema } from "../src/core/ai-contract.ts";
import { aiJson, AI_SETTINGS_ENDPOINT } from "./ai.ts";
import { itemOf } from "./api.ts";
import { attachJson } from "./card.ts";
import { THEMES, BANDS_AT_WIDTH, resize, expectNoViolations } from "./design-screens.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { jobsOf, sweepNow } from "./ingest.ts";
import { attachScreenshot, storeSettings, viewportAt } from "./look.ts";

const NARROWEST = 390;

const AI_DEADLINE_MS = 10 * 60 * 1000;

export async function configureDigest(
  screen: FreshScreen,
  input: Readonly<{ provider: string; baseUrl: string; model: string; key: string }>,
): Promise<void> {
  await screen.page.goto("/settings");
  await aiJson(screen, AiSettingsViewSchema, "PUT", AI_SETTINGS_ENDPOINT, JSON.stringify(input));
}

export async function digestScreens(
  screen: FreshScreen,
  info: TestInfo,
  state: string,
): Promise<void> {
  const { page } = screen;

  for (const theme of THEMES) {
    await viewportAt(page, NARROWEST);
    await storeSettings(page, { theme });

    for (const [width, bands] of BANDS_AT_WIDTH) {
      await resize(page, width, bands);
      await expect(page.locator("article.it").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expectNoViolations(page, `${state} ${theme} at ${width}px`);
      await attachScreenshot(page, info, `${state}-${theme}-${width}`);
    }
  }
}

export function digestRecord(screen: FreshScreen, id: number) {
  return screen.fresh.query(
    `SELECT d.digest, d.provider, d.model, d.generation, i.generation AS currentGeneration, t.id AS taskId, t.item_id AS taskItemId, t.state, t.input_revision AS revision FROM digests d JOIN items i ON i.id = d.item_id JOIN ai_tasks t ON t.id = d.task_id WHERE d.item_id = ${id}`,
    z.array(
      z.object({
        digest: z.string().transform((text) => DigestSchema.parse(JSON.parse(text))),
        provider: z.string(),
        model: z.string(),
        generation: z.number(),
        currentGeneration: z.number(),
        taskId: z.number(),
        taskItemId: z.number().nullable(),
        state: z.string(),
        revision: z.number(),
      }),
    ),
  );
}

export function lastDigestTask(screen: FreshScreen) {
  return screen.fresh.query(
    "SELECT deadline, state, refusal, status FROM ai_tasks ORDER BY id DESC LIMIT 1",
    z.array(
      z.object({
        deadline: z.number(),
        state: z.string(),
        refusal: z.string().nullable(),
        status: z.number().nullable(),
      }),
    ),
  )[0];
}

export async function proveCatalogLinks(
  screen: FreshScreen,
  id: number,
  info: TestInfo,
): Promise<void> {
  const linked = () =>
    screen.fresh.query(
      `SELECT topic_id AS topicId FROM items WHERE id = ${id}`,
      z.array(z.object({ topicId: z.number().nullable() })),
    )[0];

  const names = () =>
    screen.fresh.query(
      `SELECT tags.name FROM item_tags JOIN tags ON tags.id = item_tags.tag_id WHERE item_tags.item_id = ${id}`,
      z.array(z.object({ name: z.string() })),
    );

  const digest = digestRecord(screen, id)[0]?.digest;

  if (digest === undefined) throw new Error("No model Digest");
  expect(linked()?.topicId).not.toBeNull();
  expect(
    digest.tags.length,
    "The real Provider must return Tags for the linking proof",
  ).toBeGreaterThan(0);
  assertLinkedNames(names(), digest.tags);
  screen.fresh.sql(
    `UPDATE items SET topic_id = NULL WHERE id = ${id}; DELETE FROM item_tags WHERE item_id = ${id}`,
  );
  expect((await itemOf(screen.context.request, id)).digestTopic).toBe(digest.topic);
  await sweepNow(screen.context.request, screen.fresh);
  await expect.poll(() => linked()?.topicId, { timeout: 90_000 }).not.toBeNull();
  expect((await itemOf(screen.context.request, id)).digestTopic).toBe(digest.topic);
  assertLinkedNames(names(), digest.tags);
  await attachJson(
    info,
    "model-catalog-and-older-linking.json",
    JSON.stringify({ linked: linked(), digest }),
  );
}

function assertLinkedNames(
  rows: readonly Readonly<{ name: string }>[],
  expected: readonly string[],
): void {
  expect(rows.length).toBeGreaterThanOrEqual(Math.min(1, expected.length));
  expect(rows.length).toBeLessThanOrEqual(expected.length);

  for (const { name } of rows) expect(expected).toContain(name);
}

export async function assertDelay(
  screen: FreshScreen,
  attempts: number,
  delay: number,
  id: number,
  info: TestInfo,
): Promise<void> {
  const task = lastDigestTask(screen);

  const job = jobsOf(id, screen.fresh, "digest")[0];
  expect(
    (job?.next_attempt_at ?? 0) - ((task?.deadline ?? 0) - AI_DEADLINE_MS),
  ).toBeGreaterThanOrEqual(delay);
  await attachJson(info, `retry-${attempts}.json`, JSON.stringify({ job, task }));
}
