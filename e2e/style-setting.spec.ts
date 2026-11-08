import { type Page, expect, test } from "@playwright/test";

import {
  app,
  computed,
  attachScreenshot,
  pickStyle,
  panel,
  radioOf,
  openPanel,
  pickFont,
  pickOption,
  storeSettings,
  storedSettings,
} from "./look.ts";

async function expectStyleControls(page: Page): Promise<void> {
  const dialog = panel(page);
  await expect(dialog.getByRole("combobox", { name: "Font" })).toBeDisabled();
  await expect(dialog.getByRole("combobox", { name: "Font" })).toHaveAccessibleDescription(
    "Set by the style",
  );
  await expect(dialog.getByRole("radiogroup", { name: "Accent" })).toHaveAccessibleDescription(
    "Set by the style",
  );

  for (const swatch of await dialog.locator(".st-sw").all()) {
    await expect(swatch).toHaveCSS("cursor", "default");
    await expect(swatch).toHaveCSS("opacity", "0.45");
  }

  for (const radio of await dialog
    .getByRole("radiogroup", { name: "Accent" })
    .getByRole("radio")
    .all()) {
    await expect(radio).toBeDisabled();
  }
}

test("a Style overrides and restores Font and Accent, and Reset look restores the Look defaults", async ({
  page,
}, info) => {
  await storeSettings(page, {
    font: "news",
    accent: "moss",
    theme: "dark",
    openAs: "sheet",
    width: "wide",
    density: "roomy",
  });
  const before = await computed(app(page), "--acc");
  const dialog = await openPanel(page);
  await pickStyle(dialog, "slash");
  await expect(app(page)).toHaveAttribute("data-style", "slash");
  expect(await computed(app(page), "--acc")).not.toBe(before);
  expect(await computed(app(page), "--f-display")).toMatch(/^["']Playfair Display Variable["']/u);
  await expectStyleControls(page);
  await page.reload();
  await expect(app(page)).toHaveAttribute("data-style", "slash");
  await expect(page.locator("html")).toHaveAttribute("data-style", "slash");
  const reloaded = await openPanel(page);
  await pickStyle(reloaded, "library");
  await expect(app(page)).toHaveAttribute("data-style", "library");
  await expect(reloaded.getByRole("combobox", { name: "Font" })).toHaveValue("news");
  await expect(reloaded.getByRole("combobox", { name: "Font" })).toBeEnabled();
  await expect(radioOf(reloaded, "Accent", "Moss")).toBeEnabled();
  expect(await computed(app(page), "--acc")).toBe(before);
  expect(await computed(app(page), "--f-display")).toContain("Newsreader Variable");
  await pickFont(reloaded, "Instrument Serif + Geist");
  await pickOption(reloaded, "Accent", "Rust");
  await pickStyle(reloaded, "mymind");
  expect(await storedSettings(page)).toMatchObject({
    font: "inst",
    accent: "rust",
    style: "mymind",
  });
  await reloaded.getByRole("button", { name: "Reset look" }).click();
  expect(await storedSettings(page)).toMatchObject({
    style: "library",
    font: "plex",
    accent: "cobalt",
  });
  await expect(reloaded.getByRole("combobox", { name: "Font" })).toBeEnabled();
  await expect(reloaded.getByText("Set by the style", { exact: true })).toHaveCount(0);
  await attachScreenshot(page, info, "reset-look");
});
