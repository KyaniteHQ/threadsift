import { type Locator, type Page, expect, test } from "@playwright/test";

import {
  DESKTOP,
  app,
  computed,
  expectModal,
  gear,
  openPanel,
  panel,
  pickOption,
  px,
  radioOf,
  storeSettings,
  tapDimmedPage,
} from "./look.ts";

const PHONE = { width: 390, height: 640 } as const;

async function onPhone(page: Page) {
  await page.setViewportSize(PHONE);
  await page.goto("/");
  await expect(app(page)).toHaveAttribute("data-bp", /phone/u);

  return openPanel(page);
}

async function expectFixedPartsInView(page: Page): Promise<void> {
  const dialog = panel(page);
  await dialog.locator(".st-body").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  for (const part of [
    dialog.locator(".st-head"),
    dialog.getByRole("button", { name: "Close" }),
    dialog.locator(".st-foot"),
  ]) {
    const box = await part.boundingBox();
    expect(box?.y, "a fixed part starts inside the viewport").toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0), "and ends inside it").toBeLessThanOrEqual(
      PHONE.height,
    );
  }
}

test("the phone sheet is modal, scrolls its body and keeps Tab and focus inside", async ({
  page,
}) => {
  const dialog = await onPhone(page);
  await expectModal(dialog, true);

  const [scrollHeight, clientHeight] = await dialog
    .locator(".st-body")
    .evaluate((element) => [element.scrollHeight, element.clientHeight]);

  expect(scrollHeight, "the body is taller than its box").toBeGreaterThan(clientHeight ?? Infinity);
  await expectFixedPartsInView(page);

  const close = dialog.getByRole("button", { name: "Close" });
  const reset = dialog.getByRole("button", { name: "Reset look" });
  await reset.focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(reset).toBeFocused();

  const field = page.locator(".field input");
  await field.evaluate((element) => {
    element.focus();
  });
  await expect(field).not.toBeFocused();
});

test("the phone sheet is the browser's own modal dialog: no tabindex, a dimmed page, and nothing outside it takes focus", async ({
  page,
}) => {
  const dialog = await onPhone(page);
  await expect.soft(dialog).not.toHaveAttribute("tabindex", /./u);

  const scrim = await dialog.evaluate(
    (element) => getComputedStyle(element, "::backdrop").backgroundColor,
  );

  expect.soft(scrim, "the page behind the sheet is dimmed").not.toBe("rgba(0, 0, 0, 0)");

  const outsiderFocused = await page.evaluate(() => {
    const outsider = document.createElement("button");
    document.body.append(outsider);
    outsider.focus();

    return document.activeElement === outsider;
  });

  expect.soft(outsiderFocused, "a button outside the app root cannot take focus").toBe(false);
});

test("Escape and Close shut the phone sheet and return focus to the gear", async ({ page }) => {
  const dialog = await onPhone(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(gear(page)).toBeFocused();

  await openPanel(page);
  await panel(page).getByRole("button", { name: "Close" }).click();
  await expect(panel(page)).toBeHidden();
  await expect(gear(page)).toBeFocused();

  await openPanel(page);
  await tapDimmedPage(page);
  await expect(panel(page)).toBeHidden();
  await expect(gear(page)).toBeFocused();
});

test("on a wide screen Escape and a second gear press close the popover and a press on the list leaves focus there", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  const dialog = await openPanel(page);
  await expectModal(dialog, false);
  await expect(dialog.getByRole("radio", { name: "Light", checked: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(gear(page)).toBeFocused();

  await openPanel(page);
  await gear(page).click();
  await expect(dialog).toBeHidden();
  await expect(gear(page)).toBeFocused();

  await openPanel(page);
  await page.locator("#results").click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("main.list")).toBeFocused();

  await openPanel(page);
  await dialog.getByRole("button", { name: "Reset look" }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog).toBeHidden();
});

test("an open panel turns into the sheet under 760px and back into the popover", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  const dialog = await openPanel(page);
  await pickOption(dialog, "Density", "Roomy");

  await expect(dialog.getByRole("radio", { name: "Roomy", checked: true })).toBeFocused();

  await page.setViewportSize(PHONE);
  await expectModal(dialog, true);
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "Roomy", checked: true })).toBeFocused();

  await page.setViewportSize(DESKTOP);
  await expectModal(dialog, false);
  await expect(dialog.getByRole("button", { name: "Close" })).toHaveCount(0);
  await expect(dialog.getByRole("radio", { name: "Roomy", checked: true })).toBeFocused();
});

test("widening the sheet past 760px while Close has focus keeps focus in the panel", async ({
  page,
}) => {
  const dialog = await onPhone(page);
  await dialog.getByRole("button", { name: "Close" }).focus();

  await page.setViewportSize(DESKTOP);
  await expectModal(dialog, false);
  await expect(dialog.getByRole("radio", { name: "Light", checked: true })).toBeFocused();
});

test("the paste field's text is 16px or more at 390px for every Density and Text size", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);

  for (const density of ["compact", "comfortable", "roomy"]) {
    for (const size of ["small", "medium", "large"]) {
      await storeSettings(page, { density, size });
      await expect(app(page)).toHaveAttribute("data-density", density);
      await expect(app(page)).toHaveAttribute("data-size", size);
      await expect(app(page)).toHaveAttribute("data-bp", /phone/u);
      const fieldSize = px(await computed(page.locator(".field input"), "font-size"));

      expect(
        fieldSize,
        `paste field text at ${density} density and ${size} text size`,
      ).toBeGreaterThanOrEqual(16);
    }
  }
});

async function expectOneTabStopPerGroup(page: Page, dialog: Locator): Promise<void> {
  const stops = [
    dialog.getByRole("combobox", { name: "Font" }),
    radioOf(dialog, "Text size", "Medium"),
    radioOf(dialog, "Text width", "Medium"),
    radioOf(dialog, "Density", "Compact"),
    radioOf(dialog, "Accent", "Cobalt"),
    dialog.getByRole("link", { name: "Instance settings" }),
    dialog.getByRole("button", { name: "Reset look" }),
  ];

  for (const stop of stops) {
    await page.keyboard.press("Tab");
    await expect(stop).toBeFocused();
  }
}

test("each single-choice group is a radio group with one Tab stop and arrow keys", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  const dialog = await openPanel(page);
  const theme = dialog.getByRole("radiogroup", { name: "Theme", exact: true });

  await expect(dialog.getByRole("radiogroup")).toHaveCount(5);

  const names = await dialog
    .locator('input[type="radio"]')
    .evaluateAll((inputs) => new Set(inputs.map((input) => input.getAttribute("name"))).size);

  expect(names, "one native radio name for each of the five settings").toBe(5);
  await expect(theme.getByRole("radio", { name: "Light" })).toBeFocused();

  const order = ["Dark", "Sepia", "Match system", "Light"] as const;

  for (const name of order) {
    await page.keyboard.press("ArrowRight");
    await expect(theme.getByRole("radio", { name })).toBeFocused();
    await expect(theme.getByRole("radio", { name })).toBeChecked();
  }

  await page.keyboard.press("ArrowLeft");
  await expect(theme.getByRole("radio", { name: "Match system" })).toBeChecked();
  await page.keyboard.press("ArrowUp");
  await expect(theme.getByRole("radio", { name: "Sepia" })).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(theme.getByRole("radio", { name: "Match system" })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(theme.getByRole("radio", { name: "Light" })).toBeChecked();
  await expect(app(page)).toHaveAttribute("data-theme", "light");

  await expectOneTabStopPerGroup(page, dialog);
});

test("Shift+Tab after a click on the sheet's title stays inside the sheet", async ({ page }) => {
  const dialog = await onPhone(page);
  await dialog.locator(".st-title").click();
  await page.keyboard.press("Shift+Tab");

  const inside = await dialog.evaluate((element) => element.contains(document.activeElement));

  expect(inside, "focus is still in the sheet").toBe(true);
});

test("the sheet's outline is a title, two group headings and no landmark, and no name repeats as a title", async ({
  page,
}) => {
  const dialog = await onPhone(page);

  await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(["Settings"]);
  await expect(dialog.getByRole("heading", { level: 3 })).toHaveText(["Reading", "Cards and tags"]);
  await expect(dialog.getByRole("region")).toHaveCount(0);

  const titled = await page
    .locator("[title]")
    .evaluateAll(
      (elements) =>
        elements.filter(
          (element) => element.getAttribute("title") === element.getAttribute("aria-label"),
        ).length,
    );

  expect(titled, "elements whose title repeats their aria-label").toBe(0);
  await expect(dialog.getByRole("button", { name: "Reset look" })).not.toHaveAttribute(
    "title",
    /./u,
  );
});
