import { browser } from "wxt/browser";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

import {
  type Candidate,
  type Posted,
  RELAY_PORT,
  type RedditConnectState,
  relayAnswer,
  relayWorking,
  requestIdOf,
  workerAnswerState,
  workerIsWorking,
} from "../../src/core/reddit-relay-contract.ts";
import { REDDIT_DEADLINE_MS } from "../lib/config.ts";

function askWorker(working: () => void): Promise<RedditConnectState | null> {
  const port = browser.runtime.connect({ name: RELAY_PORT });
  let accepted = false;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      port.disconnect();
      resolve("failed");
    }, REDDIT_DEADLINE_MS);

    port.onMessage.addListener((message: Candidate) => {
      const state = workerAnswerState(message);

      if (workerIsWorking(message)) {
        accepted = true;
        working();
      }

      if (state !== null) {
        clearTimeout(timer);
        port.disconnect();
        resolve(state);
      }
    });

    port.onDisconnect.addListener(() => {
      clearTimeout(timer);
      resolve(accepted ? "failed" : null);
    });
  });
}

async function relay(id: string): Promise<void> {
  const state = await askWorker(() => {
    window.postMessage(relayWorking(id), location.origin);
  });

  if (state !== null) window.postMessage(relayAnswer(id, state), location.origin);
}

export default defineUnlistedScript({
  main() {
    window.addEventListener("message", ({ source, origin, data }: Readonly<Posted>) => {
      const id = source === window && origin === location.origin ? requestIdOf(data) : null;

      if (id !== null) void relay(id);
    });
  },
});
