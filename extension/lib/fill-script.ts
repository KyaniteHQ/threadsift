import { FILL_SCRIPT_ID, REDDIT_HOSTS, hasRedditAccess } from "./config.ts";
import { type Registration, syncContentScript } from "./content-script-sync.ts";
import { fillWanted } from "./credentials.ts";

async function wanted(): Promise<Registration | null> {
  const active = (await hasRedditAccess()) && (await fillWanted());

  return active ? { js: "fill.js", matches: REDDIT_HOSTS } : null;
}

export function syncFillScript(): Promise<void> {
  return syncContentScript(FILL_SCRIPT_ID, wanted);
}
