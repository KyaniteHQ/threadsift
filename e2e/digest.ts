import { type TestInfo, expect } from "@playwright/test";
import { z } from "zod";

import { AiSettingsViewSchema, DigestSchema } from "../src/core/ai-contract.ts";
import { createToken } from "./access-helpers.ts";
import { bearer } from "./access.ts";
import { aiJson, AI_SETTINGS_ENDPOINT } from "./ai.ts";
import { THEMES, BANDS_AT_WIDTH, resize, expectNoViolations } from "./design-screens.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { jobsOf, sweepNow } from "./ingest.ts";
import { attachScreenshot, storeSettings } from "./look.ts";

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
    `SELECT d.digest, d.provider, d.model, d.generation, i.generation AS currentGeneration, t.id AS taskId, t.state, t.input_revision AS revision FROM digests d JOIN items i ON i.id = d.item_id JOIN ai_tasks t ON t.id = d.task_id WHERE d.item_id = ${id}`,
    z.array(
      z.object({
        digest: z.string().transform((text) => DigestSchema.parse(JSON.parse(text))),
        provider: z.string(),
        model: z.string(),
        generation: z.number(),
        currentGeneration: z.number(),
        taskId: z.number(),
        state: z.string(),
        revision: z.number(),
      }),
    ),
  );
}

export async function unchangedOpenDigest(screen: FreshScreen, id: number): Promise<void> {
  const before = jobsOf(id, screen.fresh);

  const { value } = await createToken(screen.context.request, "Digest retry proof");

  const response = await screen.context.request.post(`/api/items/${id}/digest`, {
    headers: bearer(value),
  });

  expect(response.status()).toBe(200);
  expect(jobsOf(id, screen.fresh)).toEqual(before);
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
      `SELECT topic_id AS topicId, (SELECT count(*) FROM item_tags WHERE item_id = ${id}) AS tags FROM items WHERE id = ${id}`,
      z.array(z.object({ topicId: z.number().nullable(), tags: z.number() })),
    )[0];

  const digest = digestRecord(screen, id)[0]?.digest;

  if (digest === undefined) throw new Error("No model Digest");
  expect(linked()?.topicId).not.toBeNull();
  expect(linked()?.tags).toBe(
    new Set(
      digest.tags.map((name) =>
        name.normalize("NFKC").toLowerCase().trim().replaceAll(/\s+/gu, " "),
      ),
    ).size,
  );
  screen.fresh.sql(
    `UPDATE items SET topic_id = NULL WHERE id = ${id}; DELETE FROM item_tags WHERE item_id = ${id}`,
  );
  const before = await screen.context.request.get(`/api/items/${id}`);
  const projection = z.object({ item: z.object({ digestTopic: z.string() }) });
  expect(projection.parse(await before.json()).item.digestTopic).toBe(digest.topic);
  screen.fresh.sql("DELETE FROM scheduled_runs");
  await sweepNow(screen.context.request, screen.fresh);
  await expect.poll(() => linked()?.topicId, { timeout: 90_000 }).not.toBeNull();
  const after = await screen.context.request.get(`/api/items/${id}`);
  expect(projection.parse(await after.json()).item.digestTopic).toBe(digest.topic);
  await info.attach("model-catalog-and-older-linking.json", {
    body: JSON.stringify({ linked: linked(), digest }),
    contentType: "application/json",
  });
}
