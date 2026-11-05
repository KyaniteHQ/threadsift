import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";

import { type Instance, anonymous, launchFresh } from "./access.ts";

export interface FreshScreen {
  readonly fresh: Instance;
  readonly context: BrowserContext;
  readonly page: Page;
  close(): Promise<void>;
}

export async function openFresh(browser: Browser, code: string | null): Promise<FreshScreen> {
  const fresh = launchFresh(code);
  const context = await browser.newContext({ baseURL: fresh.url });
  const page = await context.newPage();

  return {
    fresh,
    context,
    page,
    close: async () => {
      await context.close();
      fresh.stop();
    },
  };
}

export async function setUpByApi(
  instance: Instance,
  code: string,
  password: string,
): Promise<string> {
  const stranger = await anonymous(instance.url);

  try {
    const response = await stranger.post("/api/setup", { data: { code, password } });
    expect(response.status(), "setup through the API").toBe(204);

    return response.headers()["set-cookie"] ?? "";
  } finally {
    await stranger.dispose();
  }
}

export function lockFor(instance: Instance, kind: "setup" | "login", milliseconds: number): void {
  const until = `CAST(strftime('%s', 'now') AS INTEGER) * 1000 + ${milliseconds}`;

  instance.sql(
    `INSERT INTO throttles (kind, failures, locked_until) VALUES ('${kind}', 10, ${until}) ON CONFLICT (kind) DO UPDATE SET failures = 10, locked_until = ${until}`,
  );
}
