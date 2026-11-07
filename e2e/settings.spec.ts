import { type Page, expect, test } from "@playwright/test";

import { SETTINGS } from "../design/system/settings-table.ts";
import { RESET_NOTE } from "../web/src/text.ts";
import {
  DESKTOP,
  HUES,
  NON_DEFAULT,
  app,
  attachScreenshot,
  computed,
  expectChosen,
  expectModal,
  gear,
  openPanel,
  panel,
  pickFont,
  pickOption,
  px,
  storeSettings,
  storedSettings,
  tapDimmedPage,
  titledRow,
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
  expect(await computed(app(page), "--ah")).toBe(HUES.moss);
  expect(await computed(app(page), "--chars")).toBe("68");

  const column = page.locator(".rd-col");
  const wide = px(await computed(column, "max-width"));
  await pickOption(panel(page), "Text width", "Medium");
  const medium = px(await computed(column, "max-width"));
  await pickOption(panel(page), "Text width", "Wide");

  expect(wide, "the Reader's measure at Wide is wider than at Medium").toBeGreaterThan(medium);
  await expect(title).toHaveCSS("margin-top", "5px");
}

async function listSizes(page: Page): Promise<number[]> {
  return [
    px(await computed(titledRow(page).locator(".it-title"), "font-size")),
    px(await computed(page.locator(".field input").first(), "font-size")),
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

  for (const scheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(app(page)).toHaveAttribute("data-theme", scheme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    await expect(panel(page).getByText(new RegExp(`${scheme} now`, "u"))).toBeVisible();
    expect((await storedSettings(page))?.["theme"], "stored Theme").toBe("system");
  }
}

async function openPhoneSheetAndTapAway(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 640 });
  await gear(page).click();
  await expectModal(panel(page), true);
  await tapDimmedPage(page);
  await expect(panel(page)).toBeHidden();
  await expect(gear(page)).toBeFocused();
}

test("the owner sets six settings, resets the look, follows the device and opens the phone sheet", async ({
  page,
}, testInfo) => {
  await page.setViewportSize(DESKTOP);
  await storeSettings(page, { comments: "cards", tags: "chips", images: "off", openAs: "sheet" });
  await expect(titledRow(page)).toBeVisible();
  await page.goto(`/items/${await titledRow(page).getAttribute("data-key")}`);
  await expect(page.locator(".rd-col")).toBeVisible();

  await test.step("six settings are kept across a reload", async () => {
    await setSixSettings(page);
    await attachScreenshot(page, testInfo, "1-six-settings-set");
    await page.reload();
    await expect(titledRow(page)).toBeVisible();
    await expectSixSettingsKept(page);
    await expectSixSettingsDrawn(page);
    await expectLargerThanMedium(page);
    await attachScreenshot(page, testInfo, "2-after-reload");
  });

  await test.step("Reset look keeps Theme dark on a light device", async () => {
    await resetWhileDark(page);
    await attachScreenshot(page, testInfo, "3-after-reset-look");
  });

  await test.step("Match system follows the device with the panel open", async () => {
    await followDevice(page);
    await attachScreenshot(page, testInfo, "4-match-system-light");
  });

  await test.step("the phone gets a modal sheet that a tap on the dimmed page closes", async () => {
    await openPhoneSheetAndTapAway(page);
    await attachScreenshot(page, testInfo, "5-sheet-closed-by-tap");
  });
});

test("a click on the Font label focuses the Font select", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  const dialog = await openPanel(page);
  await dialog.getByText("Font", { exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Font" })).toBeFocused();
});
