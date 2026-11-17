import { browser } from "wxt/browser";

import { oneAtATime } from "./access.ts";

export interface Registration {
  readonly js: string;
  readonly matches: readonly string[];
}

type Decide = () => Promise<Registration | null>;

async function syncOnce(id: string, decide: Decide): Promise<void> {
  const wanted = await decide();

  const [registered] = await browser.scripting.getRegisteredContentScripts({ ids: [id] });

  const current = registered?.matches ?? [];

  const unchanged =
    wanted !== null &&
    current.length === wanted.matches.length &&
    wanted.matches.every((match) => current.includes(match));

  if (unchanged || (wanted === null && registered === undefined)) return;

  if (registered !== undefined) await browser.scripting.unregisterContentScripts({ ids: [id] });

  if (wanted !== null) {
    await browser.scripting.registerContentScripts([
      {
        id,
        js: [wanted.js],
        matches: [...wanted.matches],
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
  }
}

const inOrder = oneAtATime();

export function syncContentScript(id: string, decide: Decide): Promise<void> {
  return inOrder(() => syncOnce(id, decide));
}
