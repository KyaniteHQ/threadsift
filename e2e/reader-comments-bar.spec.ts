import { type Page, expect, test } from "@playwright/test";

import { SETTINGS } from "../design/system/settings-table.ts";
import { commentsButtonLabels } from "../web/src/reader-text.ts";
import { newCode, newPassword } from "./access.ts";
import { comments, openItem, sweepBar } from "./comment-reader.ts";
import { MANY, type Seeded, THREAD, seedThreads } from "./comment-thread.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { watchLayout } from "./layout-shift.ts";
import { DESKTOP, afterTwoFrames, delayFonts, openPanel, pickOption } from "./look.ts";
import { bar, crowdedControls } from "./reader.ts";

test.describe.configure({ timeout: 600_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

const PHONE = { width: 390, height: 640 } as const;
const FONT_DELAY_MS = 1_500;

let screen: FreshScreen;
let ids: Seeded;

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  ids = await seedThreads(screen);
});

test.afterAll(async () => {
  await screen.close();
});

test("a four-digit Kept count fits the bar at every width down to 320 px in one of the three forms", async () => {
  const labels = commentsButtonLabels({ kept: MANY.kept, total: MANY.reported });
  const page = await openItem(screen, 1920, ids.many);

  await expect(bar(page).locator(".rd-cm")).toHaveAccessibleName(labels.full);

  const seen = await sweepBar(page, { from: 750, to: 320, step: 10 });
  const forms = [labels.full, labels.short, labels.count];
  const ranks = seen.map((text) => forms.indexOf(text));

  expect(ranks, "only the three forms appear").not.toContain(-1);
  expect(ranks, "the label never grows as the page narrows").toEqual(
    ranks.toSorted((left, right) => left - right),
  );
  expect(seen.at(-1), "the narrowest bar shows the count").toBe(labels.count);
  await expect(bar(page).locator(".rd-cm")).toHaveAccessibleName(labels.full);
});

interface Pick {
  readonly label: string;
  readonly option: string;
  readonly kind: "segments" | "select" | "swatches";
}

function looksToPick(): readonly Pick[] {
  return SETTINGS.filter((setting) => setting.look && setting.shown).flatMap((setting) => {
    const rest = setting.options.filter((option) => option.id !== setting.default);
    const home = setting.options.filter((option) => option.id === setting.default);

    return [...rest, ...home].map((option) => ({
      label: setting.label,
      option: option.label,
      kind: setting.kind,
    }));
  });
}

async function choose(page: Page, { label, option, kind }: Readonly<Pick>): Promise<void> {
  const dialog = await openPanel(page);

  if (kind === "select")
    await dialog
      .getByRole("combobox", { name: label, exact: true })
      .selectOption({ label: option });
  else await pickOption(dialog, label, option);

  await page.keyboard.press("Escape");
}

async function looksStayStill(size: Readonly<{ width: number; height: number }>): Promise<void> {
  const page = await screen.context.newPage();

  try {
    await page.setViewportSize(size);
    const watch = await watchLayout(page);
    await page.goto(`/items/${ids.thread}`);
    await expect(comments(page).locator("li.cm")).toHaveCount(THREAD.rows);
    await afterTwoFrames(page);
    await delayFonts(page, FONT_DELAY_MS);

    for (const pick of looksToPick()) {
      const where = `${pick.label} ${pick.option}`;
      await watch.restart();
      await choose(page, pick);
      await afterTwoFrames(page);
      await expect(comments(page).locator("li.cm")).toHaveCount(THREAD.rows);
      await afterTwoFrames(page);
      await expect.poll(() => crowdedControls(page), { message: where }).toEqual([]);

      const { barShifts, bar: positions } = await watch.snapshot();

      expect(Object.keys(positions).length, `${where}: controls seen`).toBeGreaterThan(2);

      for (const [part, seen] of Object.entries(positions)) {
        const limit = part.endsWith(":y") ? 1 : 2;

        expect(
          seen.length,
          `${where}: ${part} took ${seen.join(" then ")}, at most ${limit} allowed`,
        ).toBeLessThanOrEqual(limit);
      }

      expect(barShifts, `${where}: layout shifts of the bar after the change`).toBeLessThanOrEqual(
        1,
      );
    }
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.close();
  }
}

for (const [size, name] of [
  [PHONE, "a phone"],
  [DESKTOP, "a desktop"],
] as const)
  test(`on ${name} no Look setting moves the reader bar or its controls, in the change or in the font that arrives after it`, async () => {
    await looksStayStill(size);
  });
