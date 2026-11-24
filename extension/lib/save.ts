import { browser } from "wxt/browser";
import { z } from "zod";

import { BudgetRefusalSchema } from "../../src/core/contract/error-wire.ts";
import { SavedItemResponseSchema } from "../../src/core/contract/item-route-wire.ts";
import { type SaveItemInput, SaveRefusalSchema } from "../../src/core/contract/save-wire.ts";
import {
  SuppliedPageSchema,
  UNSUPPORTED_PAGE_LINK,
} from "../../src/core/contract/supplied-page.ts";
import { type Config, holdsInstanceAccess, instanceAnswer, instanceRequest } from "./config.ts";
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

const SavedSchema = SavedItemResponseSchema.pick({ url: true });

const UNKNOWN_STRING_IS_ABSENT = z.string().transform((): undefined => undefined);

const TolerantRefusalSchema = SaveRefusalSchema.extend({
  fetch: SaveRefusalSchema.shape.fetch.or(UNKNOWN_STRING_IS_ABSENT),
  code: SaveRefusalSchema.shape.code.or(UNKNOWN_STRING_IS_ABSENT),
});

const BudgetSpentSchema = BudgetRefusalSchema.extend({ fetch: z.string().optional() });

const SAVED_KIND = {
  whole: "saved",
  "replies-missing": "saved-incomplete",
  "page-only": "saved-page",
} as const satisfies Record<Completeness, SaveState["kind"]>;

const WEB_PAGE = /^https?:/u;

type Captured = z.infer<typeof CapturedSchema>;

type PageBody = Readonly<Pick<SaveItemInput, "url"> & { page: NonNullable<SaveItemInput["page"]> }>;

type Saving = Fetched<ThreadBody | PageBody>;

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

function refusedState(refusal: Readonly<z.output<typeof TolerantRefusalSchema>> | null): SaveState {
  if (refusal?.fetch === "refused") return { kind: "private-link" };

  return refusal?.code === UNSUPPORTED_PAGE_LINK
    ? { kind: "unsupported-link" }
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
      const saved = await instanceAnswer(response, SavedSchema);

      if (saved === null) return { kind: "failed" };

      const itemUrl = new URL(saved.url, origin).href;

      return { kind: SAVED_KIND[completeness], itemUrl };
    }

    case 400:
      return refusedState(await instanceAnswer(response, TolerantRefusalSchema));
    case 401:
      return { kind: "token-refused" };
    case 403:
      return { kind: "scope-refused" };
    case 409:
      return { kind: "thread-kept" };
    case 413:
      return { kind: "too-large" };
    case 429:
      return (await instanceAnswer(response, BudgetSpentSchema)) === null
        ? { kind: "failed" }
        : { kind: "budget-spent" };
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
