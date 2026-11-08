import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { expectNoViolations } from "./design-screens.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { storeLook } from "./library-visit.ts";
import { delayFonts } from "./look.ts";
import { seedRows } from "./reader.ts";

const FONT_HOLD_MS = 1500;
const WIDTHS = [390, 800, 1100, 1440] as const;

const LOOKS = [
  ["List", {}],
  ["List in the dark theme", { theme: "dark" }],
  ["Grid", { layout: "grid" }],
] as const;

let screen: FreshScreen;

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  seedRows(screen, [{ url: "https://example.org/caching", title: "An article about caching" }]);
});

test.afterAll(async () => {
  await screen.close();
});

async function checkSkeleton(width: number, stored: Readonly<Record<string, string>>) {
  const page = await screen.context.newPage();

  try {
    await page.setViewportSize({ width, height: 900 });
    await storeLook(page, stored);
    await delayFonts(page, FONT_HOLD_MS);
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.locator(".it-ghost").first()).toBeVisible();
    await expectNoViolations(page, `skeleton at ${width}px`);
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.close();
  }
}

for (const [look, stored] of LOOKS)
  for (const width of WIDTHS)
    test(`the skeleton drawn while the faces load passes the design checks for ${look} at ${width} px`, async () => {
      await checkSkeleton(width, stored);
    });
