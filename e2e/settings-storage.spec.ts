import { expect, test } from "@playwright/test";

import { SETTINGS } from "../design/system/settings-table.ts";
import { DEFAULTS } from "../design/system/settings.ts";
import {
  app,
  NON_DEFAULT,
  fillLocalStorage,
  openPanel,
  pickOption,
  storeRaw,
  storeSettings,
  storedSettings,
  type Stored,
} from "./look.ts";

const VALID = { ...DEFAULTS, ...NON_DEFAULT } as const;

function withoutWidth(): Stored {
  return Object.fromEntries(Object.entries(VALID).filter(([key]) => key !== "width"));
}

const STORED_CASES = [
  { name: "one unknown option id", stored: { ...VALID, font: "papyrus" }, resets: ["font"] },
  { name: "one unknown key", stored: { ...VALID, sparkle: "on" }, resets: [] },
  { name: "one missing key", stored: withoutWidth(), resets: ["width"] },
  { name: "images stored as true", stored: { ...VALID, images: true }, resets: ["images"] },
  {
    name: "layout stored as grid, which is not offered yet",
    stored: { ...VALID, layout: "grid" },
    resets: ["layout"],
  },
] as const;

test("a stored setting that is not one of the table's option ids falls back alone", async ({
  page,
}) => {
  for (const { name, stored, resets } of STORED_CASES) {
    await storeSettings(page, stored);

    for (const row of SETTINGS) {
      const expected = resets.some((key) => key === row.key) ? row.default : VALID[row.key];
      await expect(app(page), `${name}: ${row.key}`).toHaveAttribute(row.attribute, expected);
    }

    await pickOption(await openPanel(page), "Text width", "Narrow");
    const written = await storedSettings(page);
    expect(Object.keys(written ?? {}).toSorted(), `${name}: keys written`).toEqual(
      SETTINGS.map((row) => row.key).toSorted(),
    );
    await page.keyboard.press("Escape");
  }
});

test("unparsable JSON, null and an array each load the defaults and the panel still works", async ({
  page,
}) => {
  for (const text of ["{not json", "null", "[]", '"dark"', "7"]) {
    await storeRaw(page, text);

    for (const row of SETTINGS) {
      await expect(app(page), `${text}: ${row.key}`).toHaveAttribute(row.attribute, row.default);
    }

    await pickOption(await openPanel(page), "Theme", "Sepia");
    await expect(app(page), `${text}: after choosing Sepia`).toHaveAttribute("data-theme", "sepia");
    expect((await storedSettings(page))?.["theme"], `${text}: stored Theme`).toBe("sepia");
    await page.keyboard.press("Escape");
  }
});

test("with the real localStorage full, a change still applies and Reset look still works", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(app(page)).toBeVisible();
  await fillLocalStorage(page);

  const refused = await page.evaluate(() => {
    try {
      localStorage.setItem("probe", "x");

      return "accepted";
    } catch (error) {
      return error instanceof DOMException ? error.name : "other";
    }
  });

  expect(refused, "the filled storage refuses a one-character write").toBe("QuotaExceededError");

  const dialog = await openPanel(page);
  await pickOption(dialog, "Text size", "Large");
  await pickOption(dialog, "Theme", "Dark");
  await expect(app(page)).toHaveAttribute("data-size", "large");
  await expect(app(page)).toHaveAttribute("data-theme", "dark");
  expect(await storedSettings(page), "nothing could be stored").toBeNull();

  await dialog.getByRole("button", { name: "Reset look" }).click();
  await expect(app(page)).toHaveAttribute("data-size", "medium");
  await expect(app(page)).toHaveAttribute("data-theme", "dark");
  await expect(dialog).toBeVisible();
  await pickOption(dialog, "Density", "Roomy");
  await expect(app(page)).toHaveAttribute("data-density", "roomy");
  expect(errors, "no script error while storage refuses every write").toEqual([]);
});

test("a change made in a second tab reaches the first without a reload and is not overwritten", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(app(page)).toHaveAttribute("data-theme", "light");

  const other = await context.newPage();
  await other.goto("/");
  await pickOption(await openPanel(other), "Theme", "Sepia");

  await expect(app(page)).toHaveAttribute("data-theme", "sepia");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia");

  await pickOption(await openPanel(page), "Text size", "Large");
  const stored = await storedSettings(page);
  expect(stored?.["theme"], "the first tab kept the second tab's Theme").toBe("sepia");
  expect(stored?.["size"], "and wrote its own change").toBe("large");
  await other.close();
});
