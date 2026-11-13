import { type Browser, type Page, test } from "@playwright/test";

import { grokBotFlow } from "./grok-bot-flow.ts";
import { proposalsFlow } from "./proposals-flow.ts";
import { redditAccountFlow } from "./reddit-account-flow.ts";

export async function settingsSteps(page: Page, browser: Browser): Promise<void> {
  await test.step("follow the settings panel's Proposals link, see the no-Provider empty state with no Reject, reload on the address, fit a phone width, and visit it signed out", () =>
    proposalsFlow(page, browser));
  await test.step("save a Grok Bot address and key in Settings, see the key marked saved after a reload, see a new address ask for a key, fit a phone width, and remove it", () =>
    grokBotFlow(page));
  await test.step("save a made-up Reddit session in Settings, see it connected after a reload, fit a phone width, and disconnect it", () =>
    redditAccountFlow(page));
}
