import type { Browser } from "wxt/browser";

import { changeSettings } from "./change.ts";
import { loadConfigView } from "./credentials.ts";
import { logFailure } from "./log.ts";
import { savePage } from "./save.ts";
import {
  CONFIG_PORT,
  type ChangeAnswer,
  type ConfigView,
  SAVE_PORT,
  SETTINGS_PORT,
  SettingsRequestSchema,
  type SaveState,
} from "./state.ts";

type Answer = SaveState | ConfigView | ChangeAnswer;

type Port = Browser.runtime.Port;

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a browser Port holds mutable listener state, so it cannot be deeply readonly.
async function serve(port: Port, compute: () => Promise<Answer>): Promise<void> {
  try {
    port.postMessage(await compute());
  } catch (cause) {
    logFailure(`${port.name}-answer-failed`, cause);
    port.disconnect();
  }
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a browser Port holds mutable listener state, so it cannot be deeply readonly.
export function servePort(port: Port): void {
  switch (port.name) {
    case SAVE_PORT:
      void serve(port, savePage);
      break;
    case CONFIG_PORT:
      void serve(port, loadConfigView);
      break;
    case SETTINGS_PORT:
      port.onMessage.addListener((message) => {
        void serve(port, () => changeSettings(SettingsRequestSchema.parse(message)));
      });
      break;
    default:
      break;
  }
}
