import { type Locator, type Page, expect, test } from "@playwright/test";

import { SETTINGS } from "../web/src/access-text.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import { filled } from "../web/src/text.ts";
import { newCode, minimumPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP, afterTwoFrames } from "./look.ts";
import { tokenNameField } from "./setup-screens.ts";
import { addToken, createButton, mint, revokeOf, valueField } from "./tokens.ts";

const NAME_LIMIT = 80;
const TOO_LONG = NAME_LIMIT + 27;
const PIXEL = 1;

let screen: FreshScreen;
const code = newCode();
const password = minimumPassword();

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, code, password);
});

test.afterAll(async () => {
  await screen.close();
});

async function centreOf(box: Promise<{ y: number; height: number } | null>): Promise<number> {
  const found = await box;
  expect(found).not.toBeNull();

  return (found?.y ?? 0) + (found?.height ?? 0) / 2;
}

test("the token name stops at 80 characters", async () => {
  const { page } = screen;
  await page.goto("/settings");
  await expect(tokenNameField(page)).toHaveAttribute("maxlength", String(NAME_LIMIT));
  await tokenNameField(page).pressSequentially("n".repeat(TOO_LONG));
  await expect(tokenNameField(page)).toHaveValue("n".repeat(NAME_LIMIT));
});

test("Create stays level with the name field while the field shows an error", async () => {
  const { page } = screen;
  await page.setViewportSize(DESKTOP);
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: AI_TEXT.save, exact: true })).toBeVisible();
  await afterTwoFrames(page);
  const quiet = await centreOf(createButton(page).boundingBox());
  const input = await centreOf(tokenNameField(page).boundingBox());
  expect(Math.abs(quiet - input), "Create is level with the field").toBeLessThan(PIXEL);

  await tokenNameField(page).press("Enter");
  await expect(page.getByRole("alert")).toHaveText(SETTINGS.tokenNameRequired);
  const withError = await centreOf(createButton(page).boundingBox());
  const inputWithError = await centreOf(tokenNameField(page).boundingBox());
  expect(Math.abs(withError - inputWithError), "Create stays level").toBeLessThan(PIXEL);
});

const PHONE = { width: 390, height: 844 } as const;

async function create(page: Page, name: string): Promise<void> {
  await page.goto("/settings");
  await mint(page, name);
}

function selectedText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;

    return active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement
      ? active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0)
      : "";
  });
}

function frameOf(button: Locator): Promise<string> {
  return button.evaluate((element) => {
    const style = getComputedStyle(element);

    return `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`;
  });
}

function lastLineWords(sentence: Locator): Promise<number> {
  return sentence.evaluate((element) => {
    const node = element.firstChild;

    if (!(node instanceof Text)) {
      return 0;
    }

    const text = node.textContent;
    const tops: number[] = [];

    for (const match of text.matchAll(/\S+/gu)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      tops.push(Math.round(range.getBoundingClientRect().top));
    }

    const last = Math.max(...tops);

    return tops.filter((top) => top === last).length;
  });
}

test("the new token's field is described by the sentence that says where the value goes", async () => {
  const { page } = screen;
  await page.setViewportSize(DESKTOP);
  await create(page, "Described");
  await expect(valueField(page)).toHaveAccessibleDescription(SETTINGS.revealPaste);
});

test("the reveal names its token, keeps Copy beside the value and puts Done below as a framed button", async () => {
  const { page } = screen;
  await page.setViewportSize(PHONE);
  await create(page, "Beside");
  await expect(
    page.getByRole("heading", { name: filled(SETTINGS.revealTitleNamed, { name: "Beside" }) }),
  ).toBeVisible();
  const value = await valueField(page).boundingBox();
  const copy = await page.getByRole("button", { name: SETTINGS.copy }).boundingBox();
  const done = page.getByRole("button", { name: SETTINGS.done });
  const doneBox = await done.boundingBox();

  expect(value && copy && doneBox).toBeTruthy();
  expect(copy?.y ?? 0, "Copy shares the value's row").toBeLessThan(
    (value?.y ?? 0) + (value?.height ?? 0),
  );
  expect(doneBox?.y ?? 0, "Done sits below Copy").toBeGreaterThanOrEqual(
    (copy?.y ?? 0) + (copy?.height ?? 0),
  );

  expect(await frameOf(done), "Done has the frame Copy has").toBe(
    await frameOf(page.getByRole("button", { name: SETTINGS.copy })),
  );
});

async function expectOneLine(width: number): Promise<void> {
  const { page } = screen;
  await page.setViewportSize({ width, height: 900 });
  await create(page, `Wide ${String(width)}`);

  const takesOneLine = await valueField(page).evaluate((element) => {
    const style = getComputedStyle(element);

    const padding =
      Number(style.paddingTop.slice(0, -2)) + Number(style.paddingBottom.slice(0, -2));

    return element.scrollHeight - padding < 2 * Number(style.fontSize.slice(0, -2));
  });

  expect(takesOneLine, "the value takes one line").toBe(true);
  const value = await valueField(page).boundingBox();
  const copy = await page.getByRole("button", { name: SETTINGS.copy }).boundingBox();
  expect(copy?.x ?? 0, "Copy sits right of the value").toBeGreaterThanOrEqual(
    (value?.x ?? 0) + (value?.width ?? 0),
  );
  await page.getByRole("button", { name: SETTINGS.done }).click();
}

test("the token value is one line with Copy beside it at 760px", async () => {
  await expectOneLine(760);
});

test("the token value is one line with Copy beside it at 1440px", async () => {
  await expectOneLine(1440);
});

test("the token name field has no placeholder", async () => {
  const { page } = screen;
  await page.goto("/settings");
  await expect(tokenNameField(page)).not.toHaveAttribute("placeholder");
});

test("the whole token value is on screen and selected when the field has focus", async () => {
  const { page } = screen;
  await page.setViewportSize(PHONE);
  await create(page, "Whole");
  const field = valueField(page);

  const value = await field.inputValue();

  const cutOff = await field.evaluate(
    (element) =>
      element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
  );

  expect(value).toMatch(/^tsa_/u);
  expect(cutOff, "no part of the value is clipped").toBe(false);
  await expect(field).toBeFocused();
  const selected = await selectedText(page);
  expect(selected).toBe(value);
});

test("the reveal sentence does not end on a lone word at 390px", async () => {
  const { page } = screen;
  await page.setViewportSize(PHONE);
  await create(page, "Sentence");
  const sentence = page.locator(".reveal p").first();
  expect(await lastLineWords(sentence)).toBeGreaterThan(1);
});

test("a refused copy is announced and leaves the value selected in a focused field", async ({
  browser,
}) => {
  const { page, fresh } = screen;
  await page.setViewportSize(DESKTOP);
  await create(page, "Refused");
  const session = await browser.newBrowserCDPSession();
  await session.send("Browser.setPermission", {
    permission: { name: "clipboard-write" },
    setting: "denied",
    origin: new URL(fresh.url).origin,
  });
  await page.getByRole("button", { name: SETTINGS.copy }).click();
  await expect(page.getByRole("alert")).toHaveText(SETTINGS.copyFailed);
  await expect(valueField(page)).toBeFocused();
  const selected = await selectedText(page);
  expect(selected).toBe(await valueField(page).inputValue());
});

test("each Revoke button is named for its token", async () => {
  const { page } = screen;
  await page.setViewportSize(DESKTOP);
  await page.goto("/settings");
  await addToken(page, "Named one");
  await addToken(page, "Named two");
  await expect(revokeOf(page, "Named one")).toHaveCount(1);
  await expect(revokeOf(page, "Named two")).toHaveCount(1);
  await expect(revokeOf(page, "Named one")).toHaveText(SETTINGS.revoke);
});

test("the revoke question says what revoking does", async () => {
  const { page } = screen;
  await page.setViewportSize(DESKTOP);
  await page.goto("/settings");
  await addToken(page, "Effect");
  await revokeOf(page, "Effect").click();
  await expect(page.getByText(SETTINGS.revokeEffect)).toBeVisible();
});

test("Escape cancels the revoke question and returns focus to that token's Revoke", async () => {
  const { page } = screen;
  await page.setViewportSize(DESKTOP);
  await page.goto("/settings");
  await addToken(page, "Escaped");
  await revokeOf(page, "Escaped").click();
  await expect(page.getByRole("button", { name: SETTINGS.cancel })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: SETTINGS.revokeConfirm })).toHaveCount(0);
  await expect(revokeOf(page, "Escaped")).toBeFocused();
});
