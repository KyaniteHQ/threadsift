import { browser } from "wxt/browser";
import { z } from "zod";

import { SuppliedPageSchema } from "../../src/core/supplied-page.ts";
import { type Config, hostPattern } from "./config.ts";
import { loadConfig } from "./credentials.ts";
import type { SaveState } from "./state.ts";

const CapturedSchema = SuppliedPageSchema.extend({ url: z.string() });

const SavedSchema = z.object({ url: z.string() });

const RefusalSchema = z.object({ error: z.string(), fetch: z.string().optional() });

export const REQUEST_DEADLINE_MS = 25_000;

const WEB_PAGE = /^https?:/u;

async function capture(): Promise<z.infer<typeof CapturedSchema> | "page-blocked"> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });

  if (tab?.id === undefined || !WEB_PAGE.test(tab.url ?? "")) return "page-blocked";

  try {
    const [injected] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["/capture.js"],
    });

    const captured = CapturedSchema.safeParse(injected?.result);

    return captured.success ? captured.data : "page-blocked";
  } catch {
    return "page-blocked";
  }
}

async function refusedState(response: Response): Promise<SaveState> {
  const refusal = RefusalSchema.safeParse(await response.json().catch(() => null));

  if (!refusal.success) return { kind: "failed" };

  if (refusal.data.fetch === "refused") return { kind: "private-link" };

  return refusal.data.error.startsWith("page:") ? { kind: "unsupported-link" } : { kind: "failed" };
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
    case 413:
      return { kind: "too-large" };
    case 503:
      return { kind: "updating" };
    default:
      return { kind: "failed" };
  }
}

async function send(
  { origin, token }: Readonly<Config>,
  captured: Readonly<z.infer<typeof CapturedSchema>>,
): Promise<SaveState> {
  const { url, ...page } = captured;

  try {
    const response = await fetch(new URL("/api/items", origin), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ url, page }),
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

  const captured = await capture();

  return captured === "page-blocked" ? { kind: "page-blocked" } : send(config, captured);
}
