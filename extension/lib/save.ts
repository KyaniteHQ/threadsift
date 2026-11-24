import { browser } from "wxt/browser";
import { z } from "zod";

import { SuppliedPageSchema } from "../../src/core/contract/supplied-page.ts";
import { holdsInstanceAccess } from "./config.ts";
import { loadConfig } from "./credentials.ts";
import { type ThreadTab, fetchThread, pageCompleteness } from "./reddit-thread.ts";
import { type Saving, send } from "./save-request.ts";
import type { SaveState } from "./state.ts";
import { resultInTab } from "./tab-result.ts";

const CapturedSchema = SuppliedPageSchema.extend({ url: z.string() });

const WEB_PAGE = /^https?:/u;

type Captured = z.infer<typeof CapturedSchema>;

async function activeTab(): Promise<ThreadTab | null> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const url = tab?.url ?? "";

  return tab?.id !== undefined && WEB_PAGE.test(url) ? { id: tab.id, url } : null;
}

function capturedPage(tabId: number): Promise<Captured | null> {
  return resultInTab(
    () => browser.scripting.executeScript({ target: { tabId }, files: ["/capture.js"] }),
    CapturedSchema,
    "page-capture-failed",
  );
}

async function bodyOf(tab: Readonly<ThreadTab>): Promise<Saving | null> {
  const thread = await fetchThread(tab);

  if (thread !== null) return thread;

  const captured = await capturedPage(tab.id);

  if (captured === null) return null;

  const { url, ...page } = captured;

  return {
    body: { url, page },
    completeness: pageCompleteness(tab),
  };
}

export async function savePage(): Promise<SaveState> {
  const config = await loadConfig();

  if (config === null) return { kind: "not-configured" };

  if (!(await holdsInstanceAccess(config.origin))) {
    return { kind: "access-missing" };
  }

  const tab = await activeTab();
  const saving = tab === null ? null : await bodyOf(tab);

  return saving === null ? { kind: "page-blocked" } : send(config, saving);
}
