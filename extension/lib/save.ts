import { browser } from "wxt/browser";
import { z } from "zod";

import { hostOf, isTrackingParam } from "../../src/core/contract/links.ts";
import { SuppliedPageSchema } from "../../src/core/contract/supplied-page.ts";
import { type Config, holdsInstanceAccess } from "./config.ts";
import { loadConfig } from "./credentials.ts";
import { type ThreadTab, fetchThread, pageCompleteness } from "./reddit-thread.ts";
import { send } from "./save-request.ts";
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

function pageKey(address: string): string {
  const { origin, pathname, search } = new URL(address);
  const host = hostOf(address);
  const fields = search === "" ? [] : search.slice(1).split("&");
  const kept = fields.filter((field) => !isTrackingParam(field, host));
  const path = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  return `${origin}${path}${kept.length > 0 ? `?${kept.join("&")}` : ""}`;
}

function isSamePage(started: string, captured: string): boolean {
  return URL.canParse(captured) && pageKey(captured) === pageKey(started);
}

async function saveTab(config: Readonly<Config>, tab: Readonly<ThreadTab>): Promise<SaveState> {
  const thread = await fetchThread(tab);

  if (thread !== null) return send(config, thread);

  const captured = await capturedPage(tab.id);

  if (captured === null) return { kind: "page-blocked" };

  if (!isSamePage(tab.url, captured.url)) return { kind: "failed" };

  const { url, ...page } = captured;

  return send(config, { body: { url, page }, completeness: pageCompleteness(tab) });
}

export async function savePage(): Promise<SaveState> {
  const [tab, config] = await Promise.all([activeTab(), loadConfig()]);

  if (config === null) return { kind: "not-configured" };

  if (!(await holdsInstanceAccess(config.origin))) {
    return { kind: "access-missing" };
  }

  return tab === null ? { kind: "page-blocked" } : saveTab(config, tab);
}
