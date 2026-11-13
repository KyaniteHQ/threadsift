import { browser } from "wxt/browser";

import type { RedditConnectState } from "../../src/core/reddit-relay-contract.ts";
import { REDDIT_DEADLINE_MS, REDDIT_PERMISSIONS, holdsRedditConnect } from "./config.ts";
import { logFailure } from "./log.ts";
import type { Tone } from "./page-look.ts";
import { REDDIT_PORT, RedditAnswerSchema, type RedditRequest, ask } from "./state.ts";
import { TEXT } from "./text.ts";

export interface RedditView {
  readonly kind: "loading" | "working" | RedditConnectState;
  readonly access: boolean;
}

export type RedditAction = "connect" | "reconnect" | "disconnect";

interface Look {
  readonly text: string;
  readonly actions: readonly RedditAction[];
  readonly tone: Tone;
}

const LOOKS = {
  loading: { text: "", actions: [], tone: "plain" },
  working: { text: TEXT.redditWorking, actions: [], tone: "plain" },
  unavailable: { text: "", actions: [], tone: "plain" },
  none: { text: TEXT.redditNone, actions: ["connect"], tone: "plain" },
  connected: { text: TEXT.redditConnected, actions: ["disconnect"], tone: "ok" },
  expired: { text: TEXT.redditExpired, actions: ["reconnect"], tone: "warn" },
  unreadable: { text: TEXT.redditUnreadable, actions: ["reconnect"], tone: "warn" },
  missing: { text: TEXT.redditMissing, actions: [], tone: "warn" },
  "no-access": { text: TEXT.redditNoAccess, actions: ["connect"], tone: "warn" },
  "signed-out": { text: TEXT.redditSignedOut, actions: ["connect"], tone: "warn" },
  "scope-refused": { text: TEXT.redditScopeRefused, actions: ["reconnect"], tone: "warn" },
  "token-refused": { text: TEXT.redditTokenRefused, actions: ["reconnect"], tone: "warn" },
  unreachable: { text: TEXT.redditUnreachable, actions: ["reconnect"], tone: "warn" },
  failed: { text: TEXT.redditFailed, actions: ["reconnect"], tone: "warn" },
  "access-kept": { text: TEXT.redditAccessKept, actions: [], tone: "warn" },
} as const satisfies Record<RedditView["kind"], Look>;

const LABELS = {
  connect: TEXT.redditConnect,
  reconnect: TEXT.redditReconnect,
  disconnect: TEXT.redditDisconnect,
} as const satisfies Record<RedditAction, string>;

export function redditTone({ kind }: Readonly<RedditView>): Tone {
  return LOOKS[kind].tone;
}

export function redditLabel(action: RedditAction): string {
  return LABELS[action];
}

export function redditStatusText({ kind }: Readonly<RedditView>): string {
  return LOOKS[kind].text;
}

export function redditActions({ kind, access }: Readonly<RedditView>): readonly RedditAction[] {
  const own: readonly RedditAction[] = LOOKS[kind].actions;

  return access && !own.includes("disconnect") ? [...own, "disconnect"] : own;
}

async function viewOf(kind: RedditView["kind"]): Promise<RedditView> {
  return { kind, access: await holdsRedditConnect() };
}

async function askReddit(request: Readonly<RedditRequest>): Promise<RedditView> {
  try {
    const { state } = await ask(REDDIT_PORT, RedditAnswerSchema, {
      deadlineMs: REDDIT_DEADLINE_MS,
      request,
    });

    return await viewOf(state);
  } catch (cause) {
    logFailure("reddit-answer-failed", cause);

    return viewOf("failed");
  }
}

async function requestAccess(): Promise<boolean | null> {
  try {
    return await browser.permissions.request(REDDIT_PERMISSIONS);
  } catch (cause) {
    logFailure("reddit-request-failed", cause);

    return null;
  }
}

export function loadReddit(): Promise<RedditView> {
  return askReddit({ kind: "read" });
}

export async function connectRedditFromPage(): Promise<RedditView> {
  const granted = await requestAccess();

  if (granted === null) return viewOf("failed");

  return granted ? askReddit({ kind: "connect" }) : viewOf("no-access");
}

export function disconnectRedditFromPage(): Promise<RedditView> {
  return askReddit({ kind: "disconnect" });
}

export async function reconnectFromPopup(): Promise<RedditView | null> {
  if (await holdsRedditConnect()) return askReddit({ kind: "connect" });

  await browser.runtime.openOptionsPage();

  return null;
}
