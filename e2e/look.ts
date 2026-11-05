import { type Locator, type Page, type TestInfo, expect } from "@playwright/test";
import { z } from "zod";

import { STORAGE_KEY, type SettingKey } from "../design/system/settings.ts";
import { SETTINGS_GEAR_LABEL, SETTINGS_TITLE } from "../web/src/text.ts";
import { postLink } from "./api.ts";
import { newRunId } from "./links.ts";

const StoredSchema = z.record(z.string(), z.string());

export type Stored = Readonly<Partial<Record<SettingKey, string | boolean>>>;

export const NON_DEFAULT = {
  openAs: "sheet",
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

export const HUES = { cobalt: "258", rust: "42", moss: "145", iris: "300", teal: "200" } as const;

export const DESKTOP = { width: 1440, height: 900 } as const;

const TITLED = "Example Domain";

export async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
}

export async function seedItems(page: Page): Promise<void> {
  await postLink(page.request, "https://example.com/");
  await postLink(page.request, `https://example.com/${newRunId()}/link-only`);
}

export function titledRow(page: Page): Locator {
  return page.locator("article.it", { hasText: TITLED }).first();
}

export function gear(page: Page): Locator {
  return page.getByRole("button", { name: SETTINGS_GEAR_LABEL, exact: true });
}

export function panel(page: Page): Locator {
  return page.getByRole("dialog", { name: SETTINGS_TITLE });
}

export async function expectModal(dialog: Locator, modal: boolean): Promise<void> {
  await expect.poll(() => dialog.evaluate((element) => element.matches(":modal"))).toBe(modal);
}

export async function tapDimmedPage(page: Page): Promise<void> {
  await page.mouse.click(10, 10);
}

export function app(page: Page): Locator {
  return page.locator(".app");
}

export async function storeSettings(page: Page, stored: Stored, url = "/"): Promise<void> {
  await storeRaw(page, JSON.stringify(stored), url);
}

export async function storeRaw(page: Page, text: string, url = "/"): Promise<void> {
  await page.goto(url);
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: STORAGE_KEY, value: text },
  );
  await page.reload();
  await expect(app(page)).toBeVisible();
}

export async function storedSettings(page: Page): Promise<Record<string, string> | null> {
  const text = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

  return text === null ? null : StoredSchema.parse(JSON.parse(text));
}

export async function openPanel(page: Page): Promise<Locator> {
  await gear(page).click();
  await expect(panel(page)).toBeVisible();

  return panel(page);
}

export function radioOf(dialog: Locator, group: string, option: string): Locator {
  return dialog
    .getByRole("radiogroup", { name: group, exact: true })
    .getByRole("radio", { name: option, exact: true });
}

export async function pickOption(dialog: Locator, group: string, option: string): Promise<void> {
  await radioOf(dialog, group, option).click();
}

export async function pickFont(dialog: Locator, label: string): Promise<void> {
  await dialog.getByRole("combobox", { name: "Font" }).selectOption({ label });
}

export async function expectChosen(dialog: Locator, group: string, option: string): Promise<void> {
  await expect(radioOf(dialog, group, option)).toBeChecked();
}

export function px(value: string): number {
  return Number(value.replace(/px$/u, ""));
}

export function computed(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

export async function fillLocalStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sizes = [1_048_576, 1024, 64, 8, 1];
    let serial = 0;

    for (const size of sizes) {
      for (;;) {
        try {
          localStorage.setItem(`filler-${serial}`, "x".repeat(size));
          serial += 1;
        } catch {
          break;
        }
      }
    }
  });
}
