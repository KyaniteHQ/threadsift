import { type Page, expect, test } from "@playwright/test";

import { POST_TEXT_FAILED } from "../web/src/reader-text.ts";
import { RETRY_LABEL } from "../web/src/text.ts";
import { minimumPassword, newCode } from "./access.ts";
import { storeFileItem } from "./files.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";

test.use({ trace: "off", video: "off" });

const TITLE = "A post whose text chunk fails";
const PHRASE = "bold words in the post text";

async function openFailing(
  screen: FreshScreen,
  failures: number,
): Promise<{ page: Page; failed: () => number }> {
  const { page, fresh } = screen;

  const id = storeFileItem(fresh, {
    url: "https://example.com/post-text-chunk",
    title: TITLE,
    postText: `Some **${PHRASE}** to read.`,
  });

  let failed = 0;

  await page.route("**/assets/PostText-*.js", async (route) => {
    if (failed < failures) {
      failed += 1;
      await route.abort("failed");
    } else await route.fallback();
  });
  await page.goto(`/items/${id}`);

  return { page, failed: () => failed };
}

test("a post text chunk that fails to load leaves the rest of the app standing, and Try again loads it", async ({
  browser,
}) => {
  const screen = await openSignedIn(browser, newCode(), minimumPassword());

  try {
    const { page, failed } = await openFailing(screen, 2);

    await expect(page.getByText(POST_TEXT_FAILED)).toBeVisible();
    await expect(page.locator(".rd-title", { hasText: TITLE })).toBeVisible();
    expect(failed()).toBe(1);

    await page.getByRole("button", { name: RETRY_LABEL, exact: true }).click();
    await expect.poll(failed).toBe(2);
    await expect(page.getByText(POST_TEXT_FAILED)).toBeVisible();

    await page.getByRole("button", { name: RETRY_LABEL, exact: true }).click();
    await expect(page.locator(".rd-orig strong", { hasText: PHRASE })).toBeVisible();
    await expect(page.getByText(POST_TEXT_FAILED)).toHaveCount(0);
  } finally {
    await screen.close();
  }
});
