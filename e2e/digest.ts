import { type TestInfo, expect } from "@playwright/test";
import { z } from "zod";

import { AiSettingsViewSchema } from "../src/core/ai-contract.ts";
import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { bearer } from "./access.ts";
import { aiJson, AI_SETTINGS_ENDPOINT } from "./ai.ts";
import { expectNoViolations } from "./design-screens.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { storeSettings, viewportAt } from "./look.ts";
import { isContainerTarget } from "./target.ts";

const Jobs = z.array(
  z.object({
    id: z.number(),
    state: z.string(),
    attempts: z.number(),
    nextAttemptAt: z.number(),
  }),
);

export function digestJobs(screen: FreshScreen, id: number) {
  return screen.fresh.query(
    `SELECT id, state, attempts, next_attempt_at AS nextAttemptAt FROM jobs WHERE item_id = ${id} AND kind = 'digest' ORDER BY id`,
    Jobs,
  );
}

export async function configureDigest(
  screen: FreshScreen,
  input: Readonly<{ provider: string; baseUrl: string; model: string; key: string }>,
): Promise<void> {
  await screen.page.goto("/settings");
  await aiJson(screen, AiSettingsViewSchema, "PUT", AI_SETTINGS_ENDPOINT, JSON.stringify(input));
}

export async function makeDigestDue(screen: FreshScreen, jobId: number): Promise<void> {
  screen.fresh.sql(`UPDATE jobs SET next_attempt_at = 0 WHERE id = ${jobId}`);

  if (isContainerTarget()) screen.fresh.restart();
  else {
    screen.fresh.sql("DELETE FROM scheduled_runs");
    expect((await screen.context.request.get("/cdn-cgi/local/scheduled")).status()).toBe(200);
  }
}

export async function digestScreens(
  screen: FreshScreen,
  info: TestInfo,
  state: string,
): Promise<void> {
  const { page } = screen;

  for (const theme of ["light", "dark", "sepia"] as const) {
    for (const width of [390, 600, 1440, 1920]) {
      await viewportAt(page, width);
      await storeSettings(page, { theme });
      await expect(page.locator("article.it").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expectNoViolations(page, `${state} ${theme} at ${width}px`);
      const path = info.outputPath(`${state}-${theme}-${width}.png`);
      await page.screenshot({ path });
      await info.attach(`${state}-${theme}-${width}`, { path, contentType: "image/png" });
    }
  }
}

export function digestRecord(screen: FreshScreen, id: number) {
  return screen.fresh.query(
    `SELECT d.digest, d.provider, d.model, d.generation, t.id AS taskId, t.state, t.input_revision AS revision FROM digests d JOIN ai_tasks t ON t.id = d.task_id WHERE d.item_id = ${id}`,
    z.array(
      z.object({
        digest: z.string(),
        provider: z.string(),
        model: z.string(),
        generation: z.number(),
        taskId: z.number(),
        state: z.string(),
        revision: z.number(),
      }),
    ),
  );
}

export function stuckDigestItems(screen: FreshScreen): number {
  return (
    screen.fresh.query(
      "SELECT count(*) AS n FROM items i WHERE i.status = 'processing' AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.item_id = i.id AND j.state <> 'done')",
      z.array(z.object({ n: z.number() })),
    )[0]?.n ?? -1
  );
}

export async function unchangedOpenDigest(screen: FreshScreen, id: number): Promise<void> {
  const before = digestJobs(screen, id);

  const tokenResponse = await screen.context.request.post("/api/tokens", {
    data: { name: "Digest retry proof" },
  });

  expect(tokenResponse.status()).toBe(201);
  const { value } = CreatedTokenResponseSchema.parse(await tokenResponse.json());

  const response = await screen.context.request.post(`/api/items/${id}/digest`, {
    headers: bearer(value),
  });

  expect(response.status()).toBe(200);
  expect(digestJobs(screen, id)).toEqual(before);
}
