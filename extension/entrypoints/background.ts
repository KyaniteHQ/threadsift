import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { restrictStorage } from "../lib/config.ts";
import { loadConfigView } from "../lib/credentials.ts";
import { savePage } from "../lib/save.ts";
import { CONFIG_PORT, type ConfigView, SAVE_PORT, type SaveState } from "../lib/state.ts";

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

export default defineBackground({
  main() {
    void restrictStorage();

    browser.runtime.onConnect.addListener((port) => {
      const compute = answerFor(port.name);

      if (port.sender?.id !== browser.runtime.id || compute === null) return;

      void answer(compute, (value) => {
        port.postMessage(value);
      });
    });
  },
});
