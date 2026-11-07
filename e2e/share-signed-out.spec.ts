import { type Page, expect } from "@playwright/test";

import { LOGIN } from "../web/src/access-text.ts";
import { signIn } from "./access-helpers.ts";
import {
  SAME_ORIGIN,
  SIGNED_OUT,
  newPassword,
  ownerPassword,
  sessionStateOf,
  test,
} from "./access.ts";
import { listAll, listForRun } from "./api.ts";
import { ADDED, cardTitle } from "./card.ts";
import { addButton, newRunId, pasteCard, pasteField } from "./links.ts";
import { passwordField } from "./setup-screens.ts";
import { shareFromThisPage, foreignSitesPerFile } from "./share.ts";

const NEW_CARD_MS = 30_000;

const foreign = foreignSitesPerFile();

async function firstRequestShowsSignIn(page: Page): Promise<void> {
  const signInHeading = page.getByRole("heading", { name: LOGIN.heading });

  await expect(async () => {
    if (!(await signInHeading.isVisible())) await addButton(page).click({ timeout: 1000 });
    await expect(signInHeading).toBeVisible({ timeout: 1000 });
  }).toPass();
}

test("a share while signed out keeps the link through a wrong password and a sign-in, and saves only on Add", async ({
  browser,
  request,
  baseURL,
}) => {
  const run = newRunId();
  const link = `https://example.com/${run}/signed-out`;
  const before = (await listAll(request)).length;
  const context = await browser.newContext({ baseURL: baseURL ?? "", storageState: SIGNED_OUT });
  const page = await context.newPage();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: LOGIN.heading })).toBeVisible();
  await shareFromThisPage(page, { title: "A page", text: `Read ${link}` });
  await expect(page.getByRole("heading", { name: LOGIN.heading })).toBeVisible();
  await expect(page).toHaveURL(`${baseURL}/`);

  await passwordField(page).fill(newPassword());
  await page.getByRole("button", { name: LOGIN.signIn }).click();
  await expect(page.getByText(LOGIN.wrong)).toBeVisible();

  await passwordField(page).fill(ownerPassword());
  await page.getByRole("button", { name: LOGIN.signIn }).click();
  await expect(pasteField(page)).toHaveValue(link);
  expect(await listAll(request)).toHaveLength(before);

  await addButton(page).click();
  await pasteCard(page).hover();
  await expect(cardTitle(page)).toHaveText(ADDED, { timeout: NEW_CARD_MS });
  expect(await listForRun(request, run)).toHaveLength(1);
  await context.close();
});

test("a session that ends between the arrival and Add shows sign-in again with the link kept", async ({
  browser,
  request,
  baseURL,
}) => {
  const run = newRunId();
  const link = `https://example.com/${run}/expired`;
  const { value, headers, api } = await signIn(baseURL ?? "");

  const context = await browser.newContext({
    baseURL: baseURL ?? "",
    storageState: sessionStateOf(value, baseURL ?? ""),
  });

  const page = await context.newPage();

  await page.goto(foreign().pageFor(foreign().crossSite, "link", `Look: ${link}`));
  await page.locator("#go").click();
  await expect(pasteField(page)).toHaveValue(link);

  const ended = await api.post("/api/logout", { headers: { ...headers, ...SAME_ORIGIN } });
  expect(ended.status()).toBe(204);

  await firstRequestShowsSignIn(page);
  expect(await listForRun(request, run)).toHaveLength(0);

  await passwordField(page).fill(ownerPassword());
  await page.getByRole("button", { name: LOGIN.signIn }).click();
  await expect(pasteField(page)).toHaveValue(link);
  expect(await listForRun(request, run)).toHaveLength(0);

  await addButton(page).click();
  await pasteCard(page).hover();
  await expect(cardTitle(page)).toHaveText(ADDED, { timeout: NEW_CARD_MS });
  expect(await listForRun(request, run)).toHaveLength(1);
  await api.dispose();
  await context.close();
});
