import { browser } from "wxt/browser";

import { FILL_SCRIPT_ID, REDDIT_HOSTS, THREAD_PAGES } from "./config.ts";

export function hasRedditAccess(): Promise<boolean> {
  return browser.permissions.contains({ origins: REDDIT_HOSTS });
}

async function syncOnce(): Promise<void> {
  const [granted, registered] = await Promise.all([
    hasRedditAccess(),
    browser.scripting.getRegisteredContentScripts({ ids: [FILL_SCRIPT_ID] }),
  ]);

  if (granted && registered.length === 0) {
    await browser.scripting.registerContentScripts([
      {
        id: FILL_SCRIPT_ID,
        js: ["fill.js"],
        matches: THREAD_PAGES,
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
  } else if (!granted && registered.length > 0) {
    await browser.scripting.unregisterContentScripts({ ids: [FILL_SCRIPT_ID] });
  }
}

let pending: Promise<void> = Promise.resolve();

export function syncFillScript(): Promise<void> {
  const run = pending.then(syncOnce);
  pending = run.catch(() => {});

  return run;
}
