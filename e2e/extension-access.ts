import { type BrowserContext, expect } from "@playwright/test";

export type SiteAccess = "On click" | "On all sites";

const VALUES: Readonly<Record<SiteAccess, string>> = {
  "On click": "ON_CLICK",
  "On all sites": "ON_ALL_SITES",
};

export async function setSiteAccess(
  context: BrowserContext,
  id: string,
  mode: SiteAccess,
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome://extensions/?id=${id}`);
  await page.locator("#hostAccess").selectOption({ label: mode });
  await expect(page.locator("#hostAccess")).toHaveValue(VALUES[mode]);
  await page.close();
}
