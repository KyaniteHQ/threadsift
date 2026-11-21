import { browser } from "wxt/browser";

import { REDDIT_HOSTS, holdsInstanceAccess, hostPattern } from "./config.ts";
import { fillActive, loadConfig } from "./credentials.ts";
import { logFailure } from "./log.ts";
import { oneAtATime } from "./one-at-a-time.ts";

interface Script {
  readonly id: string;
  readonly js: string;
  readonly wanted: () => Promise<readonly string[] | null>;
}

async function fillMatches(): Promise<readonly string[] | null> {
  return (await fillActive()) ? REDDIT_HOSTS : null;
}

async function relayMatches(): Promise<readonly string[] | null> {
  const config = await loadConfig();

  if (config === null) return null;

  return (await holdsInstanceAccess(config.origin)) ? [hostPattern(config.origin)] : null;
}

const SCRIPTS: readonly Script[] = [
  { id: "fill", js: "fill.js", wanted: fillMatches },
  { id: "relay", js: "relay.js", wanted: relayMatches },
];

const inOrder = oneAtATime();

async function syncOnce({ id, js, wanted }: Readonly<Script>): Promise<void> {
  const matches = await wanted();

  const [registered] = await browser.scripting.getRegisteredContentScripts({ ids: [id] });

  const current = registered?.matches ?? [];

  const unchanged =
    matches !== null &&
    current.length === matches.length &&
    matches.every((match) => current.includes(match));

  if (unchanged || (matches === null && registered === undefined)) return;

  if (registered !== undefined) await browser.scripting.unregisterContentScripts({ ids: [id] });

  if (matches !== null) {
    await browser.scripting.registerContentScripts([
      {
        id,
        js: [js],
        matches: [...matches],
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
  }
}

export async function syncScripts(): Promise<void> {
  try {
    await Promise.all(SCRIPTS.map((script) => inOrder(() => syncOnce(script))));
  } catch (cause) {
    logFailure("content-scripts-sync-failed", cause);
  }
}
