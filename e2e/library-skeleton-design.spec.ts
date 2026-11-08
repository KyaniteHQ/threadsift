import { expect, test } from "@playwright/test";

import { DEFAULTS } from "../design/system/settings.ts";
import { newCode, newPassword } from "./access.ts";
import { collectDesign } from "./design-checks.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { storeLook } from "./library-visit.ts";
import { delayFonts } from "./look.ts";
import { seedRows } from "./reader.ts";

const FONT_HOLD_MS = 1500;
const WIDTHS = [390, 800, 1100, 1440] as const;

const GRID_CANVAS_MISMATCH = /^page canvas /u;

const LOOKS = [
  ["List", {}, []],
  ["List in the dark theme", { theme: "dark" }, []],
  ["Grid", { layout: "grid" }, [GRID_CANVAS_MISMATCH]],
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

async function checkSkeleton(
  width: number,
  stored: Readonly<Record<string, string>>,
  known: readonly RegExp[],
) {
  const page = await screen.context.newPage();

  try {
    await page.setViewportSize({ width, height: 900 });
    await storeLook(page, stored);
    await delayFonts(page, FONT_HOLD_MS);
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.locator(".it-ghost").first()).toBeVisible();
    const { violations } = await page.evaluate(collectDesign, DEFAULTS.font);

    expect(
      violations.filter((violation) => !known.some((pattern) => pattern.test(violation))),
      `skeleton at ${width}px`,
    ).toEqual([]);
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.close();
  }
}

for (const [look, stored, known] of LOOKS)
  for (const width of WIDTHS)
    test(`the skeleton drawn while the faces load passes the design checks for ${look} at ${width} px`, async () => {
      await checkSkeleton(width, stored, known);
    });
