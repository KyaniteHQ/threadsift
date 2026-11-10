import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { restrictStorage } from "../lib/config.ts";
import { loadConfigView } from "../lib/credentials.ts";
import { syncFillScript } from "../lib/fill-script.ts";
import { fillOpenedThread } from "../lib/fill.ts";
import { savePage } from "../lib/save.ts";
import {
  CONFIG_PORT,
  type ConfigView,
  FILL_PORT,
  SAVE_PORT,
  type SaveState,
} from "../lib/state.ts";

type Answer = SaveState | ConfigView;

function answerFor(name: string): (() => Promise<Answer>) | null {
  switch (name) {
    case SAVE_PORT:
      return savePage;
    case CONFIG_PORT:
      return loadConfigView;
    default:
      return null;
  }
}

async function answer(
  compute: () => Promise<Answer>,
  post: (value: Answer) => void,
): Promise<void> {
  post(await compute());
}

function fillFrom(tabId: number | undefined, frameId: number | undefined, url: string | undefined) {
  if (tabId !== undefined && frameId === 0 && url !== undefined) {
    void fillOpenedThread({ id: tabId, url });
  }
}

export default defineBackground({
  main() {
    void restrictStorage();
    void syncFillScript();
    browser.permissions.onAdded.addListener(() => void syncFillScript());
    browser.permissions.onRemoved.addListener(() => void syncFillScript());

    browser.runtime.onConnect.addListener((port) => {
      const { sender } = port;

      if (sender?.id !== browser.runtime.id) return;

      if (port.name === FILL_PORT) {
        fillFrom(sender.tab?.id, sender.frameId, sender.url);
        port.disconnect();

        return;
      }

      const compute = answerFor(port.name);

      if (compute === null) return;

      void answer(compute, (value) => {
        port.postMessage(value);
      });
    });
  },
});
