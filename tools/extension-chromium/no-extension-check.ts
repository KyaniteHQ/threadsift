import type { Page } from "@playwright/test";
import { z } from "zod";

import { pause as sleep } from "../../src/core/pause.ts";
import { SETTINGS } from "../../web/src/access-text.ts";
import { REDDIT_ACCOUNT_TEXT } from "../../web/src/reddit-account-text.ts";
import { snapshot } from "./browser.ts";
import { accountState } from "./instance.ts";
import { record } from "./report.ts";
import type { Run } from "./run-types.ts";

const PRESENCE_MS = 3000;

const connectButton = (page: Page) =>
  page.getByRole("button", { name: REDDIT_ACCOUNT_TEXT.connectExtension, exact: true });

const missingText = (page: Page) =>
  page.getByText(REDDIT_ACCOUNT_TEXT.extensionMissing, { exact: true });

async function turnExtensionOff(run: Readonly<Run>): Promise<void> {
  const { context, extensionId } = run.session;
  const manager = await context.newPage();
  await manager.goto("chrome://extensions/");

  const toggle = manager.locator(`extensions-item[id="${extensionId}"]`).locator("#enableToggle");
  await toggle.click();
  await sleep(1500);

  const checked = z
    .boolean()
    .parse(await toggle.evaluate((element) => "checked" in element && element.checked));

  const workers = context.serviceWorkers().length;

  record(
    "no Extension: the Extension is turned off in chrome://extensions",
    !checked && workers === 0,
    JSON.stringify({ toggleChecked: checked, extensionServiceWorkers: workers }),
  );
  await manager.close();
}

export async function noExtensionCheck(run: Readonly<Run>): Promise<void> {
  await turnExtensionOff(run);

  const page = await run.session.context.newPage();
  await page.goto(`${run.instance.origin}/`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: SETTINGS.instanceSettings }).click();
  await connectButton(page).waitFor({ timeout: 15_000 });

  const clicked = Date.now();
  await connectButton(page).click();
  await sleep(2500);

  const earlyVisible = await missingText(page).isVisible();
  await missingText(page).waitFor({ timeout: 10_000 });

  const elapsed = Date.now() - clicked;
  await snapshot(page, run.session.observed);

  record(
    "no Extension: with the Extension turned off, Reconnect shows the no-Extension text after 3 s",
    !earlyVisible && elapsed >= PRESENCE_MS && elapsed < PRESENCE_MS + 1500,
    JSON.stringify({
      visibleAt2500ms: earlyVisible,
      msUntilText: elapsed,
      accountState: await accountState(run.instance),
    }),
  );
  await page.close();
}
