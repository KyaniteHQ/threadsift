import { browser } from "wxt/browser";

import {
  applyLook,
  button,
  element,
  replaceControls,
  say,
  type Tone,
} from "../../lib/page-look.ts";
import {
  type RedditView,
  loadReddit,
  reconnectFromPopup,
  redditActions,
  redditLabel,
  redditStatusText,
  redditTone,
} from "../../lib/reddit-setting.ts";
import { SAVE_PORT, type SaveState, SaveStateSchema, ask } from "../../lib/state.ts";
import { TEXT } from "../../lib/text.ts";

const SAVE_DEADLINE_MS = 240_000;

let reddit: RedditView | null = null;

const root = document.querySelector("#root");

if (root === null) throw new Error("the popup has no root element");

const title = element("h1", { tabindex: "-1" }, "Threadsift");
const saveStatus = element("p", { class: "ext-status", role: "status" });
const saveActions = element("div", { class: "ext-actions" });
const redditStatus = element("p", { class: "ext-status", role: "status" });
const redditButtons = element("div", { class: "ext-actions" });
const redditBlock = element("div", { class: "ext-form", hidden: "" }, redditStatus, redditButtons);

root.replaceChildren(title, saveStatus, saveActions, redditBlock);

interface Message {
  readonly text: string;
  readonly tone: Tone;
}

function openItem(itemUrl: string): HTMLAnchorElement {
  return element(
    "a",
    { class: "btn btn-acc", href: itemUrl, target: "_blank", rel: "noreferrer" },
    TEXT.openItem,
  );
}

function actions(state: Readonly<SaveState>): HTMLElement[] {
  switch (state.kind) {
    case "saved":
    case "saved-incomplete":
    case "saved-page":
      return [openItem(state.itemUrl)];
    case "saving":
    case "thread-kept":
    case "budget-spent":
      return [];
    case "not-configured":
    case "access-missing":
    case "token-refused":
    case "scope-refused":
      return [button(TEXT.openSettings, () => void browser.runtime.openOptionsPage())];
    case "page-blocked":
    case "too-large":
    case "private-link":
    case "unsupported-link":
    case "unreachable":
    case "failed":
      return [button(TEXT.tryAgain, () => void save())];
    default:
      return state satisfies never;
  }
}

function warning(text: string): Message {
  return { text, tone: "warn" };
}

function messageOf(state: Readonly<SaveState>): Message {
  switch (state.kind) {
    case "saving":
      return { text: TEXT.saving, tone: "plain" };
    case "saved":
      return { text: TEXT.saved, tone: "ok" };
    case "saved-incomplete":
      return warning(TEXT.savedIncomplete);
    case "saved-page":
      return warning(TEXT.savedPage);
    case "not-configured":
      return warning(TEXT.notConfigured);
    case "access-missing":
      return warning(TEXT.accessMissing);
    case "page-blocked":
      return warning(TEXT.pageBlocked);
    case "token-refused":
      return warning(TEXT.tokenRefused);
    case "scope-refused":
      return warning(TEXT.scopeRefused);
    case "too-large":
      return warning(TEXT.tooLarge);
    case "private-link":
      return warning(TEXT.privateLink);
    case "unsupported-link":
      return warning(TEXT.unsupportedLink);
    case "thread-kept":
      return warning(TEXT.threadKept);
    case "budget-spent":
      return warning(TEXT.budgetSpent);
    case "unreachable":
      return warning(TEXT.unreachable);
    case "failed":
      return warning(TEXT.failed);
    default:
      return state satisfies never;
  }
}

function show(state: Readonly<SaveState>): void {
  const { text, tone } = messageOf(state);

  say(saveStatus, text, tone);
  replaceControls(saveActions, title, actions(state));
}

function showReddit(view: Readonly<RedditView>): void {
  const controls = redditActions(view)
    .filter((action) => action !== "disconnect")
    .map((action) => button(redditLabel(action), () => void reconnect()));

  const text = view.kind === "expired" ? TEXT.popupExpired : redditStatusText(view);

  redditBlock.hidden = false;
  say(redditStatus, text, redditTone(view));
  replaceControls(redditButtons, title, controls);
}

function moveReddit(next: RedditView): void {
  reddit = next;
  showReddit(next);
}

async function reconnect(): Promise<void> {
  if (reddit?.kind === "working") return;

  moveReddit({ kind: "working", access: false });
  moveReddit((await reconnectFromPopup()) ?? { kind: "expired", access: false });
}

async function offerReconnect(): Promise<void> {
  const view = await loadReddit();

  if (view.kind === "expired") moveReddit(view);
}

async function save(): Promise<void> {
  show({ kind: "saving" });

  try {
    show(await ask(SAVE_PORT, SaveStateSchema, { deadlineMs: SAVE_DEADLINE_MS }));
  } catch {
    show({ kind: "failed" });
  }
}

applyLook();

await save();

await offerReconnect();
