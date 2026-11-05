import type { APIRequestContext, APIResponse, Page } from "@playwright/test";

import { isSpecifiedPublic } from "./public-routes.ts";

export type Caller = "owner" | "agent token" | "nobody" | "revoked token" | "ended session";

export interface Entry {
  readonly caller: Caller;
  readonly method: string;
  readonly path: string;
  readonly status: number;
}

const MUST_BE_REFUSED: ReadonlySet<Caller> = new Set(["nobody", "revoked token", "ended session"]);
const FIRST_ERROR_STATUS = 400;

export function watchPage(page: Page, ledger: Entry[]): void {
  page.on("response", (response) => {
    const { pathname } = new URL(response.url());

    if (pathname.startsWith("/api/")) {
      ledger.push({
        caller: "owner",
        method: response.request().method(),
        path: pathname,
        status: response.status(),
      });
    }
  });
}

export async function call(
  ledger: Entry[],
  caller: Caller,
  api: APIRequestContext,
  method: string,
  path: string,
  options: Parameters<APIRequestContext["fetch"]>[1] = {},
): Promise<APIResponse> {
  const response = await api.fetch(path, { method, ...options });
  ledger.push({ caller, method, path: path.split("?")[0] ?? path, status: response.status() });

  return response;
}

export function violations(ledger: readonly Entry[]): string[] {
  return ledger.flatMap((entry) =>
    MUST_BE_REFUSED.has(entry.caller) &&
    entry.status < FIRST_ERROR_STATUS &&
    !isSpecifiedPublic(entry.method, entry.path)
      ? [`${entry.caller}: ${entry.method} ${entry.path} answered ${entry.status}`]
      : [],
  );
}
