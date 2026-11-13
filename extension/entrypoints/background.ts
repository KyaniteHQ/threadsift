import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { START_RECONCILE_DELAY_MS, exclusive, reconcileAccess } from "../lib/access.ts";
import { restrictStorage } from "../lib/config.ts";
import { syncFillScript } from "../lib/fill-script.ts";
import { cancelFills, fillOpenedThread } from "../lib/fill.ts";
import { FILL_PORT } from "../lib/state.ts";
import { servePort } from "../lib/worker-ports.ts";

function fillFrom(tabId: number | undefined, frameId: number | undefined, url: string | undefined) {
  if (tabId !== undefined && frameId === 0 && url !== undefined) {
    void fillOpenedThread({ id: tabId, url });
  }
}

export default defineBackground({
  main() {
    void restrictStorage();
    void syncFillScript();
    setTimeout(() => void exclusive(reconcileAccess), START_RECONCILE_DELAY_MS);
    browser.permissions.onAdded.addListener(() => void syncFillScript());
    browser.permissions.onRemoved.addListener(() => {
      cancelFills();
      void syncFillScript();
    });

    browser.runtime.onConnect.addListener((port) => {
      const { sender } = port;

      if (sender?.id !== browser.runtime.id) return;

      if (port.name === FILL_PORT) {
        fillFrom(sender.tab?.id, sender.frameId, sender.tab?.url);
        port.disconnect();

        return;
      }

      servePort(port);
    });
  },
});
