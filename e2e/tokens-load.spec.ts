import { expect, test } from "@playwright/test";

import { newCode, minimumPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP } from "./look.ts";
import { addToken, revokeOf } from "./tokens.ts";

let screen: FreshScreen;

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), minimumPassword());
});

test.afterAll(async () => {
  await screen.close();
});

test("a token created while the list is still loading stays in the list", async () => {
  const { page } = screen;
  await page.setViewportSize(DESKTOP);
  await page.goto("/settings");
  await addToken(page, "Loaded earlier");

  const read = Promise.withResolvers<void>();
  const mayAnswer = Promise.withResolvers<void>();

  await page.route(/\/api\/tokens$/u, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();

      return;
    }

    const response = await route.fetch();
    read.resolve();
    await mayAnswer.promise;
    await route.fulfill({ response });
  });

  try {
    await page.goto("/settings");
    await read.promise;
    await addToken(page, "Made while loading");
    mayAnswer.resolve();
    await expect(revokeOf(page, "Loaded earlier")).toHaveCount(1);
    await expect(revokeOf(page, "Made while loading")).toHaveCount(1);
  } finally {
    mayAnswer.resolve();
    await page.unroute(/\/api\/tokens$/u);
  }
});
