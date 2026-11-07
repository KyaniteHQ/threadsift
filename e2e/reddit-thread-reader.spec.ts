import { expect, test } from "@playwright/test";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { deferJobs } from "./ingest.ts";
import { gear, openPanel, panel, storeSettings, viewportAt } from "./look.ts";
import { bar, reader } from "./reader.ts";
import { FIRST_DIGEST, firstTree, post, postUrl, run } from "./thread-fixtures.ts";
import { AUTHORED_DIGEST, sendThread, threadJson } from "./threads.ts";

test.describe.configure({ timeout: 240_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterAll(async () => {
  await screen.close();
});

async function sent(
  fields: Readonly<{ url: string; content: string; digest?: object }>,
  digestHeld: boolean,
): Promise<number> {
  const restore = digestHeld ? deferJobs(screen.fresh, "digest") : () => {};

  try {
    const { status, response } = await sendThread(screen.context.request, fields);
    expect(status, await response.text()).toBeLessThan(300);

    return SavedItemResponseSchema.parse(await response.json()).item.id;
  } finally {
    restore();
  }
}

const THREADS = [
  {
    name: "a published thread with Context stubs and more stubs",
    held: false,
    id: `r${run}`,
    digest: FIRST_DIGEST,
    heading: AUTHORED_DIGEST.title,
  },
  {
    name: "a stored thread before its Digest publishes",
    held: true,
    id: `s${run}`,
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_c1"] },
    heading: `Authored thread s${run}`,
  },
] as const;

async function opensThread(thread: (typeof THREADS)[number]): Promise<void> {
  const { page } = screen;

  const id = await sent(
    {
      url: postUrl(thread.id),
      content: threadJson(post(thread.id, "A body."), firstTree("reader")),
      digest: thread.digest,
    },
    thread.held,
  );

  await viewportAt(page, 390);
  await storeSettings(page, {}, `/items/${id}`);
  await expect(reader(page)).toBeVisible();
  await expect(reader(page)).toContainText(thread.heading);
  await expect(bar(page).locator(".st-gear")).toBeVisible();
  await openPanel(page);
  await expect(gear(page)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
}

for (const thread of THREADS) {
  test(`at 390px the Reader opens ${thread.name}, with the settings gear and the panel it opens`, () =>
    opensThread(thread));
}
