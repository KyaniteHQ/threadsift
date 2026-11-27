import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { exclusive, reconcileAccess } from "../lib/access.ts";
import { removalEndsFill } from "../lib/config.ts";
import { syncScripts } from "../lib/content-scripts.ts";
import { restrictStorage, settleFill } from "../lib/credentials.ts";
import { cancelFills } from "../lib/fill.ts";
import { logFailure } from "../lib/log.ts";
import { servePort } from "../lib/worker-ports.ts";

async function followAccess(): Promise<void> {
  try {
    await exclusive(settleFill);
  } catch (cause) {
    logFailure("fill-settle-failed", cause);
  }

  await syncScripts();
}

export default defineBackground({
  main() {
    void restrictStorage();
    void followAccess();
    browser.runtime.onStartup.addListener(() => {
      void exclusive(reconcileAccess);
    });
    browser.runtime.onInstalled.addListener(() => {
      void exclusive(reconcileAccess);
    });
    browser.permissions.onAdded.addListener(() => void syncScripts());
    browser.permissions.onRemoved.addListener((removed) => {
      if (removalEndsFill(removed)) cancelFills();

      void followAccess();
    });

    browser.runtime.onConnect.addListener(servePort);
  },
});
