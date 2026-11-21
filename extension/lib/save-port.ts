import { type Browser, browser } from "wxt/browser";

import { logFailure } from "./log.ts";
import { newestRequest } from "./newest-request.ts";
import { SAVE_STATE_FACTS } from "./save-state-facts.ts";
import { savePage } from "./save.ts";
import type { SaveState } from "./state.ts";

const trackSave = newestRequest();

async function showBadge(text: string): Promise<void> {
  try {
    await browser.action.setBadgeText({ text });
  } catch (cause) {
    logFailure("save-badge-failed", cause);
  }
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a browser Port holds mutable listener state, so it cannot be deeply readonly.
export async function serveSave(port: Browser.runtime.Port): Promise<void> {
  const isNewest = trackSave();
  void showBadge("");
  let popupOpen = true;

  port.onDisconnect.addListener(() => {
    popupOpen = false;
  });

  let state: SaveState;

  try {
    state = await savePage();
  } catch (cause) {
    logFailure(`${port.name}-answer-failed`, cause);

    if (popupOpen) {
      port.disconnect();

      return;
    }

    state = { kind: "failed" };
  }

  if (popupOpen) {
    try {
      port.postMessage(state);

      return;
    } catch (cause) {
      logFailure(`${port.name}-answer-failed`, cause);
    }
  }

  if (isNewest()) await showBadge(SAVE_STATE_FACTS[state.kind].badge);
}
