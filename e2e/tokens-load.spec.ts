import { type Page, type Route, expect, test } from "@playwright/test";

import { SETTINGS } from "../web/src/access-text.ts";
import { newCode, minimumPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP } from "./look.ts";
import { tokenNameField } from "./setup-screens.ts";
import { addToken, createButton, revokeOf, valueField } from "./tokens.ts";

const TOKENS = /\/api\/tokens$/u;

let screen: FreshScreen;

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), minimumPassword());
});

test.afterAll(async () => {
  await screen.close();
});

interface Hold {
  readonly reached: PromiseWithResolvers<void>;
  readonly release: PromiseWithResolvers<void>;
}

function hold(): Hold {
  return { reached: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() };
}

async function held(route: Route, before: Hold | null, after: Hold | null): Promise<void> {
  if (before !== null) {
    before.reached.resolve();
    await before.release.promise;
  }

  const response = await route.fetch();
  after?.reached.resolve();
  await after?.release.promise;
  await route.fulfill({ response });
}

async function holding(
  page: Page,
  rules: Readonly<{ get: [Hold | null, Hold | null]; post: [Hold | null, Hold | null] }>,
  run: () => Promise<void>,
): Promise<void> {
  const holds = [...rules.get, ...rules.post].filter((entry) => entry !== null);

  await page.route(TOKENS, (route) =>
    route.request().method() === "GET"
      ? held(route, ...rules.get)
      : route.request().method() === "POST"
        ? held(route, ...rules.post)
        : route.continue(),
  );

  try {
    await run();
  } finally {
    for (const entry of holds) entry.release.resolve();
    await page.unroute(TOKENS);
  }
}

async function openWithEarlierToken(page: Page, name: string): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await page.goto("/settings");
  await addToken(page, name);
}

test("a token created while the list is still loading stays in the list", async () => {
  const { page } = screen;
  await openWithEarlierToken(page, "Loaded earlier");
  const answer = hold();

  await holding(page, { get: [null, answer], post: [null, null] }, async () => {
    await page.goto("/settings");
    await answer.reached.promise;
    await addToken(page, "Made while loading");
    answer.release.resolve();
    await expect(revokeOf(page, "Loaded earlier")).toHaveCount(1);
    await expect(revokeOf(page, "Made while loading")).toHaveCount(1);
  });
});

test("a list answer that already holds a new token shows it once", async () => {
  const { page } = screen;
  await openWithEarlierToken(page, "Listed before");
  const read = hold();
  const created = hold();

  await holding(page, { get: [read, null], post: [null, created] }, async () => {
    await page.goto("/settings");
    await read.reached.promise;
    await tokenNameField(page).fill("Listed and created");
    await createButton(page).click();
    await created.reached.promise;
    read.release.resolve();
    await expect(revokeOf(page, "Listed before")).toHaveCount(1);
    created.release.resolve();
    await expect(valueField(page)).toBeVisible();
    await page.getByRole("button", { name: SETTINGS.done }).click();
    await expect(revokeOf(page, "Listed and created")).toHaveCount(1);
  });
});

test("a token revoked before the list answer arrives stays revoked", async () => {
  const { page } = screen;
  await openWithEarlierToken(page, "Kept before");
  const read = hold();
  const answer = hold();

  await holding(page, { get: [read, answer], post: [null, null] }, async () => {
    await page.goto("/settings");
    await read.reached.promise;
    await addToken(page, "Revoked early");
    read.release.resolve();
    await answer.reached.promise;
    await revokeOf(page, "Revoked early").click();
    await page.getByRole("button", { name: SETTINGS.revokeConfirm }).click();
    await expect(revokeOf(page, "Revoked early")).toHaveCount(0);
    answer.release.resolve();
    await expect(revokeOf(page, "Kept before")).toHaveCount(1);
    await expect(revokeOf(page, "Revoked early")).toHaveCount(0);
  });
});
