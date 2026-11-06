import { type TestInfo, expect } from "@playwright/test";
import { z } from "zod";

import { AiSettingsViewSchema, DigestSchema } from "../src/core/ai-contract.ts";
import { createToken } from "./access-helpers.ts";
import { bearer } from "./access.ts";
import { aiJson, AI_SETTINGS_ENDPOINT } from "./ai.ts";
import { THEMES, BANDS_AT_WIDTH, resize, expectNoViolations } from "./design-screens.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { jobsOf } from "./ingest.ts";
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
