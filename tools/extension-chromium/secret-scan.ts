import { z } from "zod";

import { messagesOf, snapshot } from "./browser.ts";
import { record } from "./report.ts";
import type { Run } from "./run-types.ts";

const StoredSchema = z.record(z.string(), z.json());

export async function readStorage(run: Readonly<Run>): Promise<string> {
  const stored = await run.session.worker.evaluate("chrome.storage.local.get(null)");

  return JSON.stringify(StoredSchema.parse(stored));
}

export async function secretScan(run: Readonly<Run>, storage: string): Promise<void> {
  const { observed, context } = run.session;

  for (const page of context.pages()) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one page at a time.
    observed.messages.push(...(await messagesOf(page)).map(({ data }) => data));
    // oxlint-disable-next-line eslint/no-await-in-loop -- one page at a time.
    await snapshot(page, observed);
  }

  const channels = {
    "console output of pages": observed.console,
    "console output of the Extension worker": observed.worker,
    "page DOM": observed.dom,
    "posted messages": observed.messages,
    "API answers received by pages": observed.api,
    "Extension storage": [storage],
    "Instance container log": [run.instance.logs()],
    "stand-in request paths": run.standIn.log.map(({ path }) => path),
  } satisfies Record<string, readonly string[]>;

  const found = Object.entries(channels)
    .filter(([, texts]) => texts.some((text) => text.includes(run.redditSession)))
    .map(([name]) => name);

  const cookies = JSON.stringify(await context.cookies("https://www.reddit.com/"));
  const scannerWorks = cookies.includes(run.redditSession);

  record(
    "secret: the Reddit session value appears in no console output, DOM, posted message, API answer received by a page, Extension storage, container log or stand-in path",
    scannerWorks && found.length === 0,
    JSON.stringify({
      scannerFindsTheValueInTheBrowserCookieStore: scannerWorks,
      channelsWithTheValue: found,
      itemsScanned: Object.fromEntries(
        Object.entries(channels).map(([name, texts]) => [name, texts.length]),
      ),
    }),
  );
}
