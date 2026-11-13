import { type Browser, browser } from "wxt/browser";

import { RELAY_PORT, WORKER_WORKING } from "../../src/core/reddit-relay-contract.ts";
import { changeSettings } from "./change.ts";
import type { Config } from "./config.ts";
import { loadConfig, loadConfigView } from "./credentials.ts";
import { logFailure } from "./log.ts";
import { connectReddit, disconnectReddit, readRedditState } from "./reddit-account.ts";
import { savePage } from "./save.ts";
import {
  CONFIG_PORT,
  type ChangeAnswer,
  type ConfigView,
  REDDIT_PORT,
  type RedditAnswer,
  type RedditRequest,
  RedditRequestSchema,
  SAVE_PORT,
  SETTINGS_PORT,
  SettingsRequestSchema,
  type SaveState,
} from "./state.ts";

type Answer = SaveState | ConfigView | ChangeAnswer | RedditAnswer;

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

const REDDIT_CALLS = {
  read: readRedditState,
  connect: connectReddit,
  disconnect: disconnectReddit,
} as const satisfies Record<
  RedditRequest["kind"],
  (config: Config | null) => Promise<RedditAnswer["state"]>
>;

async function reddit({ kind }: Readonly<RedditRequest>): Promise<RedditAnswer> {
  return { state: await REDDIT_CALLS[kind](await loadConfig()) };
}

async function relayed(
  { url, frameId }: Readonly<{ url: string | undefined; frameId: number | undefined }>,
  working: () => void,
): Promise<RedditAnswer> {
  const config = await loadConfig();

  if (config === null || URL.parse(url ?? "")?.origin !== config.origin || frameId !== 0) {
    throw new Error("a reconnect request came from a page that is not the Instance");
  }

  working();

  return { state: await connectReddit(config) };
}

function fromOwnPage(url: string | undefined): boolean {
  return URL.parse(url ?? "")?.origin === new URL(browser.runtime.getURL("/")).origin;
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a browser Port holds mutable listener state, so it cannot be deeply readonly.
export function servePort(port: Port): void {
  if (port.name !== RELAY_PORT && !fromOwnPage(port.sender?.url)) {
    port.disconnect();

    return;
  }

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
    case REDDIT_PORT:
      port.onMessage.addListener((message) => {
        void serve(port, () => reddit(RedditRequestSchema.parse(message)));
      });
      break;
    case RELAY_PORT:
      void serve(port, () =>
        relayed({ url: port.sender?.url, frameId: port.sender?.frameId }, () => {
          port.postMessage(WORKER_WORKING);
        }),
      );
      break;
    default:
      break;
  }
}
