import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { exclusive, reconcileAccess } from "../lib/access.ts";
import { restrictStorage } from "../lib/config.ts";
import { syncScripts } from "../lib/content-scripts.ts";
import { settleFill } from "../lib/credentials.ts";
import { cancelFills, fillOpenedThread } from "../lib/fill.ts";
import { FILL_PORT } from "../lib/state.ts";
import { servePort } from "../lib/worker-ports.ts";

function fillFrom(tabId: number | undefined, frameId: number | undefined, url: string | undefined) {
  if (tabId !== undefined && frameId === 0 && url !== undefined) {
    void fillOpenedThread({ id: tabId, url });
  }
}

async function followRevoke(): Promise<void> {
  await exclusive(settleFill);
  await syncScripts();
}

export default defineBackground({
  main() {
    void restrictStorage();
    void syncScripts();
    browser.runtime.onStartup.addListener(() => {
      void exclusive(reconcileAccess);
      void syncScripts();
    });
    browser.runtime.onInstalled.addListener(() => {
      void exclusive(reconcileAccess);
      void syncScripts();
    });
    browser.permissions.onAdded.addListener(() => void syncScripts());
    browser.permissions.onRemoved.addListener(({ origins }) => {
      if ((origins ?? []).length > 0) cancelFills();

      void followRevoke();
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
