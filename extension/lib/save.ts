import { browser } from "wxt/browser";
import { z } from "zod";

import { untrackedQuery } from "../../src/core/contract/links.ts";
import { SuppliedPageSchema } from "../../src/core/contract/supplied-page.ts";
import { holdsInstanceAccess } from "./config.ts";
import { loadConfig } from "./credentials.ts";
import {
  type ThreadTab,
  fetchThread,
  pageCompleteness,
  withoutTrailingSlash,
} from "./reddit-thread.ts";
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

function pageKey(address: string): string {
  const url = new URL(address);

  return `${withoutTrailingSlash(url)}${untrackedQuery(url)}`;
}

function isSamePage(started: string, captured: string): boolean {
  return URL.canParse(captured) && pageKey(captured) === pageKey(started);
}

type Prepared =
  | { readonly step: "send"; readonly saving: Saving }
  | { readonly step: "stop"; readonly state: SaveState };

function stopped(state: SaveState): Prepared {
  return { step: "stop", state };
}

async function bodyOf(tab: Readonly<ThreadTab>): Promise<Prepared> {
  const thread = await fetchThread(tab);

  if (thread !== null) return { step: "send", saving: thread };

  const captured = await capturedPage(tab.id);

  if (captured === null) return stopped({ kind: "page-blocked" });

  if (!isSamePage(tab.url, captured.url)) return stopped({ kind: "failed" });

  const { url, ...page } = captured;

  return {
    step: "send",
    saving: { body: { url, page }, completeness: pageCompleteness(tab) },
  };
}

export async function savePage(): Promise<SaveState> {
  const [tab, config] = await Promise.all([activeTab(), loadConfig()]);

  if (config === null) return { kind: "not-configured" };

  if (!(await holdsInstanceAccess(config.origin))) {
    return { kind: "access-missing" };
  }

  const prepared = tab === null ? stopped({ kind: "page-blocked" }) : await bodyOf(tab);

  return prepared.step === "send" ? send(config, prepared.saving) : prepared.state;
}
