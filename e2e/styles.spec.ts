import { expect, test } from "@playwright/test";

import {
  app,
  computed,
  attachScreenshot,
  pickStyle,
  radioOf,
  openPanel,
  pickFont,
  pickOption,
  storeSettings,
  storedSettings,
} from "./look.ts";

test("a Style preserves Font and Accent across reloads and Reset look leaves the view settings alone", async ({
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
  expect(await computed(app(page), "--acc")).not.toBe(before);
  await expect(dialog.getByRole("combobox", { name: "Font" })).toBeDisabled();
  await page.reload();
  await expect(app(page)).toHaveAttribute("data-style", "slash");
  await expect(page.locator("html")).toHaveAttribute("data-style", "slash");
  const reloaded = await openPanel(page);
  await pickStyle(reloaded, "library");
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
    theme: "dark",
    layout: "list",
    openAs: "sheet",
    width: "medium",
    density: "compact",
  });
  await expect(reloaded.getByRole("combobox", { name: "Font" })).toBeEnabled();
  await expect(reloaded.getByText("Set by the style", { exact: true })).toHaveCount(0);
  await attachScreenshot(page, info, "reset-look");
});
