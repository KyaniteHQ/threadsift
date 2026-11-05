import { expect, test } from "@playwright/test";

import { FIELDS } from "../web/src/access-text.ts";
import { passwordField } from "./setup-screens.ts";

const SIGNED_OUT = { cookies: [], origins: [] };

test("a focused text field keeps a visible outline in forced colours", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL: baseURL ?? "",
    forcedColors: "active",
    storageState: SIGNED_OUT,
  });

  const page = await context.newPage();
  await page.goto("/");
  await expect(passwordField(page)).toBeFocused();

  const outline = await page.locator(".field").evaluate((field) => ({
    style: getComputedStyle(field).outlineStyle,
    width: getComputedStyle(field).outlineWidth,
  }));

  expect(outline.style).not.toBe("none");
  expect(outline.width).not.toBe("0px");
  await context.close();
});

test("the Show password toggle draws its own ring and leaves the field edge unlit", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL: baseURL ?? "", storageState: SIGNED_OUT });
  const page = await context.newPage();
  await page.goto("/");
  await expect(passwordField(page)).toBeFocused();
  const field = page.locator(".field");
  const edge = () => field.evaluate((element) => getComputedStyle(element).boxShadow);

  expect(await edge(), "the field edge is lit while its input has focus").not.toBe("none");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: FIELDS.showPassword })).toBeFocused();
  expect(await edge(), "the field edge is not lit while the toggle has focus").toBe("none");
  await context.close();
});
