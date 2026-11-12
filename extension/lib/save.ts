import { browser } from "wxt/browser";
import { z } from "zod";

import { SuppliedPageSchema, UNSUPPORTED_PAGE_LINK } from "../../src/core/supplied-page.ts";
import { type Config, hostPattern } from "./config.ts";
import { loadConfig } from "./credentials.ts";
import { type ThreadTab, fetchThread } from "./reddit-thread.ts";
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

export const REQUEST_DEADLINE_MS = 25_000;

const WEB_PAGE = /^https?:/u;

type Captured = z.infer<typeof CapturedSchema>;

type Body = ThreadBody | { readonly url: string; readonly page: Omit<Captured, "url"> };

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

async function bodyOf(tab: Readonly<ThreadTab>): Promise<Body | null> {
  const thread = await fetchThread(tab);

  if (thread !== null) return thread;

  const captured = await capturedPage(tab.id);

  if (captured === null) return null;

  const { url, ...page } = captured;

  return { url, page };
}

async function refusedState(response: Response): Promise<SaveState> {
  const refusal = RefusalSchema.safeParse(await response.json().catch(() => null));

  if (!refusal.success) return { kind: "failed" };

  if (refusal.data.fetch === "refused") return { kind: "private-link" };

  return refusal.data.code === UNSUPPORTED_PAGE_LINK
    ? { kind: "unsupported-link" }
    : { kind: "failed" };
}

async function stateOf(response: Response, origin: string): Promise<SaveState> {
  switch (response.status) {
    case 200:
    case 201: {
      const saved = SavedSchema.safeParse(await response.json().catch(() => null));

      return saved.success
        ? { kind: "saved", itemUrl: new URL(saved.data.url, origin).href }
        : { kind: "failed" };
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
    case 503:
      return { kind: "updating" };
    default:
      return { kind: "failed" };
  }
}

export async function send(
  { origin, token }: Readonly<Config>,
  body: Readonly<Body>,
): Promise<SaveState> {
  try {
    const response = await fetch(new URL("/api/items", origin), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_DEADLINE_MS),
    });

    return await stateOf(response, origin);
  } catch {
    return { kind: "unreachable" };
  }
}

export async function savePage(): Promise<SaveState> {
  const config = await loadConfig();

  if (config === null) return { kind: "not-configured" };

  if (!(await browser.permissions.contains({ origins: [hostPattern(config.origin)] }))) {
    return { kind: "access-missing" };
  }

  const tab = await activeTab();
  const body = tab === null ? null : await bodyOf(tab);

  return body === null ? { kind: "page-blocked" } : send(config, body);
}
