import { browser } from "wxt/browser";

import { RELAY_SCRIPT_ID, hostPattern } from "./config.ts";
import { type Registration, syncContentScript } from "./content-script-sync.ts";
import { loadConfig } from "./credentials.ts";

async function wanted(): Promise<Registration | null> {
  const config = await loadConfig();

  if (config === null) return null;

  const matches = [hostPattern(config.origin)];

  return (await browser.permissions.contains({ origins: matches }))
    ? { js: "relay.js", matches }
    : null;
}

export function syncRelayScript(): Promise<void> {
  return syncContentScript(RELAY_SCRIPT_ID, wanted);
}
