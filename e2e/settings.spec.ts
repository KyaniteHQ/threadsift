import { type Page, type TestInfo, expect, test } from "@playwright/test";

import { SETTINGS } from "../design/system/settings.ts";
import { MATCH_SYSTEM_NOTES, RESET_NOTE } from "../web/src/text.ts";
import {
  HUES,
  NON_DEFAULT,
  app,
  computed,
  expectChosen,
  fillLocalStorage,
  gear,
  openPanel,
  panel,
  pickFont,
  pickOption,
  px,
  seedItems,
  storeRaw,
  storeSettings,
  storedSettings,
  titledRow,
  type Stored,
} from "./look.ts";

const VISIBLE_CHOICES = [
  ["Theme", "Dark"],
  ["Text size", "Large"],
  ["Text width", "Wide"],
  ["Density", "Roomy"],
  ["Accent", "Moss"],
] as const;

function attributeOf(key: string): string {
  return SETTINGS.find((row) => row.key === key)?.attribute ?? "";
}

async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
}

async function setSixSettings(page: Page): Promise<void> {
  const dialog = await openPanel(page);

  for (const [group, option] of VISIBLE_CHOICES) {
    await pickOption(dialog, group, option);
  }

  await pickFont(dialog, "Newsreader + Instrument Sans");
  await expect(app(page)).toHaveAttribute("data-theme", "dark");
}

async function expectSixSettingsKept(page: Page): Promise<void> {
  const dialog = await openPanel(page);

  for (const [group, option] of VISIBLE_CHOICES) {
    await expectChosen(dialog, group, option);
  }

  await expect(dialog.getByRole("combobox", { name: "Font" })).toHaveValue("news");

  for (const key of ["theme", "font", "size", "width", "density", "accent"] as const) {
    await expect(app(page)).toHaveAttribute(attributeOf(key), NON_DEFAULT[key]);
  }

  const stored = await storedSettings(page);

  for (const key of ["theme", "font", "size", "width", "density", "accent"] as const) {
    expect(stored?.[key], `stored ${key}`).toBe(NON_DEFAULT[key]);
  }
}

async function expectSixSettingsDrawn(page: Page): Promise<void> {
  const title = titledRow(page).locator(".it-title");
  await expect(titledRow(page).locator(".it-open")).toHaveCSS(
    "font-family",
    /Newsreader Variable/u,
  );
  expect(await computed(page, ".app", "--ah")).toBe(HUES.moss);
  expect(await computed(page, ".app", "--chars")).toBe("68");

  const fontSize = px(await computed(page, ".it-title", "font-size"));
  const maxWidth = px(await computed(page, ".it-title", "max-width"));
  const measure = 68 * Number(await computed(page, ".app", "--cw")) * fontSize;
  expect(maxWidth, "the title's maximum width is Wide's measure").toBeCloseTo(measure, 0);
  await expect(title).toHaveCSS("margin-top", "5px");
}

async function listSizes(page: Page): Promise<number[]> {
  return [
    px(await computed(page, ".it-title", "font-size")),
    px(await computed(page, ".field input", "font-size")),
  ];
}

async function expectLargerThanMedium(page: Page): Promise<void> {
  const atLarge = await listSizes(page);
  await pickOption(panel(page), "Text size", "Medium");
  const atMedium = await listSizes(page);
  expect(atLarge[0], "title size at Large").toBeGreaterThan(atMedium[0] ?? Infinity);
  expect(atLarge[1], "paste field size at Large").toBeGreaterThan(atMedium[1] ?? Infinity);
  await pickOption(panel(page), "Text size", "Large");
}

async function resetWhileDark(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: "light" });
  await panel(page).getByRole("button", { name: "Reset look" }).click();
  const stored = await storedSettings(page);

  for (const row of SETTINGS.filter((setting) => setting.look)) {
    expect(stored?.[row.key], `stored ${row.key}`).toBe(row.default);
    await expect(app(page)).toHaveAttribute(row.attribute, row.default);
  }

  expect(stored?.["theme"], "stored Theme").toBe("dark");
  expect(stored?.["openAs"], "stored Open items as").toBe(NON_DEFAULT.openAs);
  await expect(app(page)).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByText(RESET_NOTE)).toBeVisible();
}

async function followDevice(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: "dark" });
  await pickOption(panel(page), "Theme", "Match system");
  const theme = panel(page).getByRole("group", { name: "Theme", exact: true });

  for (const scheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(app(page)).toHaveAttribute("data-theme", scheme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    await expect(panel(page).getByText(MATCH_SYSTEM_NOTES[scheme])).toBeVisible();
    expect((await storedSettings(page))?.["theme"], "stored Theme").toBe("system");
  }

  await expect(theme).toBeVisible();
}

async function openPhoneSheetAndTapAway(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 640 });
  await gear(page).click();
  await expect(panel(page)).toHaveAttribute("aria-modal", "true");
  await page.locator(".st-backdrop").click({ position: { x: 10, y: 10 } });
  await expect(panel(page)).toBeHidden();
  await expect(gear(page)).toBeFocused();
}

test("the owner sets six settings, resets the look, follows the device and opens the phone sheet", async ({
  page,
}, testInfo) => {
  await seedItems(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await storeSettings(page, { comments: "cards", tags: "chips", images: "off", openAs: "sheet" });

  await test.step("six settings are kept across a reload", async () => {
    await setSixSettings(page);
    await shot(page, testInfo, "1-six-settings-set");
    await page.reload();
    await expect(titledRow(page)).toBeVisible();
    await expectSixSettingsKept(page);
    await expectSixSettingsDrawn(page);
    await expectLargerThanMedium(page);
    await shot(page, testInfo, "2-after-reload");
  });

  await test.step("Reset look keeps Theme dark on a light device", async () => {
    await resetWhileDark(page);
    await shot(page, testInfo, "3-after-reset-look");
  });

  await test.step("Match system follows the device with the panel open", async () => {
    await followDevice(page);
    await shot(page, testInfo, "4-match-system-light");
  });

  await test.step("the phone gets a modal sheet that a tap on the dimmed page closes", async () => {
    await page.setViewportSize({ width: 390, height: 640 });
    await page.keyboard.press("Escape");
    await openPhoneSheetAndTapAway(page);
    await shot(page, testInfo, "5-sheet-closed-by-tap");
  });
});

const VALID = {
  layout: "list",
  openAs: "sheet",
  style: "library",
  theme: "dark",
  font: "news",
  size: "large",
  width: "wide",
  density: "roomy",
  comments: "cards",
  accent: "moss",
  tags: "chips",
  images: "off",
} as const;

function withoutWidth(): Stored {
  return Object.fromEntries(Object.entries(VALID).filter(([key]) => key !== "width"));
}

const STORED_CASES = [
  { name: "one unknown option id", stored: { ...VALID, font: "papyrus" }, resets: ["font"] },
  { name: "one unknown key", stored: { ...VALID, sparkle: "on" }, resets: [] },
  { name: "one missing key", stored: withoutWidth(), resets: ["width"] },
  { name: "images stored as true", stored: { ...VALID, images: true }, resets: ["images"] },
] as const;

test("a stored setting that is not one of the table's option ids falls back alone", async ({
  page,
}) => {
  await seedItems(page);

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
  await seedItems(page);

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
  await seedItems(page);
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
});
