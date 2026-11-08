import { type Page, type Route, expect, test } from "@playwright/test";

import { AI_TEXT } from "../web/src/ai-text.ts";
import { GITHUB_TEXT } from "../web/src/github-text.ts";
import { aiScreen, newSealingKey } from "./ai.ts";
import { type FreshScreen } from "./fresh-screen.ts";
import { GITHUB_SETTINGS_ENDPOINT, githubSection } from "./github-token.ts";
import { watchLayoutShift } from "./layout-shift.ts";
import { DESKTOP, afterTwoFrames } from "./look.ts";
import { tokenNameField } from "./setup-screens.ts";

const PHONE = { width: 390, height: 844 } as const;
const SETTINGS_ANSWERS = /\/api\/settings\/(?:ai|github)$/u;
const REQUESTS = 2;

let screen: FreshScreen;

test.describe.configure({ timeout: 120_000 });

test.beforeAll(async ({ browser }) => {
  screen = await aiScreen(browser, newSealingKey());
  const { request } = screen.context;

  const ai = await request.put("/api/settings/ai", {
    data: { provider: "openrouter", model: "layout-shift-proof", key: "layout-shift-proof-key" },
  });

  expect(ai.ok(), "a saved Provider other than the default one").toBe(true);

  const github = await request.put(GITHUB_SETTINGS_ENDPOINT, {
    data: { token: "layout-shift-proof-token" },
  });

  expect(github.ok(), "a saved GitHub token").toBe(true);
});

test.afterAll(async () => {
  await screen.close();
});

async function holdSettingsAnswers(page: Page, githubFails: boolean) {
  const arrived = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  let answers = 0;

  await page.route(SETTINGS_ANSWERS, async (route: Route) => {
    const response = await route.fetch();
    answers += 1;

    if (answers === REQUESTS) arrived.resolve();
    await released.promise;

    if (githubFails && route.request().url().endsWith("/github"))
      await route.fulfill({ status: 500, body: "{}" });
    else await route.fulfill({ response });
  });

  return {
    reached: arrived.promise,
    release: () => {
      released.resolve();
    },
  };
}

async function shiftWhileSettingsAnswerLate(
  size: Readonly<{ width: number; height: number }>,
  githubFails: boolean,
): Promise<number> {
  const page = await screen.context.newPage();

  try {
    await page.setViewportSize(size);
    const watch = await watchLayoutShift(page);
    const held = await holdSettingsAnswers(page, githubFails);

    await page.goto("/settings");
    await held.reached;
    await afterTwoFrames(page);
    const releasedAt = await page.evaluate(() => performance.now());
    held.release();

    await expect(page.getByRole("button", { name: AI_TEXT.save, exact: true })).toBeVisible();
    await expect(tokenNameField(page)).toBeVisible();

    if (githubFails) await expect(page.getByRole("alert")).toHaveText(GITHUB_TEXT.loadFailed);
    else
      await expect(
        githubSection(page).getByRole("button", { name: GITHUB_TEXT.save, exact: true }),
      ).toBeVisible();

    await afterTwoFrames(page);
    await afterTwoFrames(page);

    return watch.since(releasedAt);
  } finally {
    await page.close();
  }
}

for (const [size, label] of [
  [PHONE, "a phone"],
  [DESKTOP, "a desktop"],
] as const) {
  test(`on ${label} no section moves when the settings answer late`, async () => {
    expect(await shiftWhileSettingsAnswerLate(size, false), "layout shift").toBe(0);
  });

  test(`on ${label} no section moves when the GitHub answer is an error`, async () => {
    expect(await shiftWhileSettingsAnswerLate(size, true), "layout shift").toBe(0);
  });
}
