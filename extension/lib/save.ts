import { browser } from "wxt/browser";
import { z } from "zod";

import { BUDGET_SPENT } from "../../src/core/kinds.ts";
import { SuppliedPageSchema, UNSUPPORTED_PAGE_LINK } from "../../src/core/supplied-page.ts";
import { type Config, holdsInstanceAccess, instanceRequest } from "./config.ts";
import { loadConfig } from "./credentials.ts";
import {
  type Completeness,
  type Fetched,
  type ThreadTab,
  fetchThread,
  pageCompleteness,
} from "./reddit-thread.ts";
import type { SaveState } from "./state.ts";
import { resultInTab } from "./tab-result.ts";
import type { ThreadBody } from "./thread-body.ts";

const CapturedSchema = SuppliedPageSchema.extend({ url: z.string() });

const SavedSchema = z.object({ url: z.string() });

const RefusalSchema = z.object({
  error: z.string(),
  fetch: z.string().optional(),
  code: z.string().optional(),
});

const SAVED_KIND = {
  whole: "saved",
  "replies-missing": "saved-incomplete",
  "page-only": "saved-page",
} as const satisfies Record<Completeness, SaveState["kind"]>;

const WEB_PAGE = /^https?:/u;

type Captured = z.infer<typeof CapturedSchema>;

type Saving = Fetched<ThreadBody | { readonly url: string; readonly page: Omit<Captured, "url"> }>;

async function activeTab(): Promise<ThreadTab | null> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const url = tab?.url ?? "";

  return tab?.id !== undefined && WEB_PAGE.test(url) ? { id: tab.id, url } : null;
}

function capturedPage(tabId: number): Promise<Captured | null> {
  return resultInTab(
    () => browser.scripting.executeScript({ target: { tabId }, files: ["/capture.js"] }),
    CapturedSchema,
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

async function refusedState(response: Response): Promise<SaveState> {
  const refusal = RefusalSchema.safeParse(await response.json().catch(() => null));

  if (!refusal.success) return { kind: "failed" };

  if (refusal.data.fetch === "refused") return { kind: "private-link" };

  return refusal.data.code === UNSUPPORTED_PAGE_LINK
    ? { kind: "unsupported-link" }
    : { kind: "failed" };
}

async function spentState(response: Response): Promise<SaveState> {
  const refusal = RefusalSchema.safeParse(await response.json().catch(() => null));

  return refusal.success && refusal.data.code === BUDGET_SPENT
    ? { kind: "budget-spent" }
    : { kind: "failed" };
}

async function stateOf(
  response: Response,
  origin: string,
  completeness: Completeness,
): Promise<SaveState> {
  switch (response.status) {
    case 200:
    case 201: {
      const saved = SavedSchema.safeParse(await response.json().catch(() => null));

      if (!saved.success) return { kind: "failed" };

      const itemUrl = new URL(saved.data.url, origin).href;

      return { kind: SAVED_KIND[completeness], itemUrl };
    }

    case 400:
      return refusedState(response);
    case 401:
      return { kind: "token-refused" };
    case 403:
      return { kind: "scope-refused" };
    case 409:
      return { kind: "thread-kept" };
    case 413:
      return { kind: "too-large" };
    case 429:
      return spentState(response);
    case 503:
      return { kind: "updating" };
    default:
      return { kind: "failed" };
  }
}

export async function send(
  config: Readonly<Config>,
  { body, completeness }: Readonly<Saving>,
): Promise<SaveState> {
  try {
    const response = await instanceRequest(config, "/api/items", { method: "POST", body });

    return await stateOf(response, config.origin, completeness);
  } catch {
    return { kind: "unreachable" };
  }
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
