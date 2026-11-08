import {
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  expect,
} from "@playwright/test";

import type { ThrottleKind } from "../src/core/kinds.ts";
import { WAIT } from "../web/src/access-text.ts";
import { type Instance, anonymous, launchFresh } from "./access.ts";

export interface FreshScreen {
  readonly fresh: Instance;
  readonly context: BrowserContext;
  readonly page: Page;
  close(): Promise<void>;
}

export async function openFresh(browser: Browser, code: string | null): Promise<FreshScreen> {
  const fresh = launchFresh(code);

  try {
    const context = await browser.newContext({ baseURL: fresh.url });
    const page = await context.newPage();

    return {
      fresh,
      context,
      page,
      close: async () => {
        await page.unrouteAll({ behavior: "ignoreErrors" });
        await context.close();
        fresh.stop();
      },
    };
  } catch (error) {
    fresh.stop();
    throw error;
  }
}

export async function setUpByApi(url: string, code: string, password: string): Promise<string> {
  const stranger = await anonymous(url);

  try {
    const response = await stranger.post("/api/setup", { data: { code, password } });
    expect(response.status(), "setup through the API").toBe(204);

    return response.headers()["set-cookie"] ?? "";
  } finally {
    await stranger.dispose();
  }
}

export function lockFor(instance: Instance, kind: ThrottleKind, milliseconds: number): void {
  const until = `CAST(strftime('%s', 'now') AS INTEGER) * 1000 + ${milliseconds}`;

  instance.sql(
    `INSERT INTO throttles (kind, failures, locked_until) VALUES ('${kind}', 10, ${until}) ON CONFLICT (kind) DO UPDATE SET failures = 10, locked_until = ${until}`,
  );
}

export function endLock(instance: Instance, kind: ThrottleKind): void {
  instance.sql(`UPDATE throttles SET locked_until = 0 WHERE kind = '${kind}'`);
}

export async function openSignedIn(
  browser: Browser,
  code: string,
  password: string,
): Promise<FreshScreen> {
  const screen = await openFresh(browser, code);

  try {
    await setUpByApi(screen.fresh.url, code, password);
    const login = await screen.context.request.post("/api/login", { data: { password } });
    expect(login.status(), "login through the API").toBe(204);

    return screen;
  } catch (error) {
    await screen.close();
    throw error;
  }
}

export const LOCK_MS = 5000;
const COUNTDOWN_MS = 4000;
const OVER_MS = 9000;

export async function expectCountdown(alert: Locator): Promise<void> {
  await expect(alert).toHaveText(/wait [3-5] seconds/u);
  await expect(alert).toHaveText(/wait [1-3] seconds/u, { timeout: COUNTDOWN_MS });
  await expect(alert).toHaveText(WAIT.over, { timeout: OVER_MS });
}
