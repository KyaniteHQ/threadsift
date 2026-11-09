import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { restrictStorage } from "../lib/config.ts";
import { savePage } from "../lib/save.ts";
import { SAVE_PORT, type SaveState } from "../lib/state.ts";

async function answer(post: (state: SaveState) => void): Promise<void> {
  post(await savePage());
}

export default defineBackground({
  main() {
    void restrictStorage();

    browser.runtime.onConnect.addListener((port) => {
      if (port.sender?.id !== browser.runtime.id || port.name !== SAVE_PORT) return;

      void answer((state) => {
        port.postMessage(state);
      });
    });
  },
});
