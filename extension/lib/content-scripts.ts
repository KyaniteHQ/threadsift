import { syncFillScript } from "./fill-script.ts";
import { logFailure } from "./log.ts";
import { syncRelayScript } from "./relay-script.ts";

export async function syncScripts(): Promise<void> {
  try {
    await Promise.all([syncFillScript(), syncRelayScript()]);
  } catch (cause) {
    logFailure("content-scripts-sync-failed", cause);
  }
}
