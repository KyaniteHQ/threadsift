import { browser } from "wxt/browser";

import { applyLook, element } from "../../lib/page-look.ts";
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

let latest: SaveState = { kind: "saving" };

const root = document.querySelector("#root");

if (root === null) throw new Error("the popup has no root element");

function button(label: string, onClick: () => void): HTMLButtonElement {
  const created = element("button", { type: "button", class: "btn btn-acc" }, label);
  created.addEventListener("click", onClick);

  return created;
}

function status(text: string, tone: "ok" | "warn" | "plain"): HTMLParagraphElement {
  return element("p", { class: "ext-status", role: "status", "data-tone": tone }, text);
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
    case "updating":
    case "unreachable":
    case "failed":
      return [button(TEXT.tryAgain, () => void save())];
    default:
      return state satisfies never;
  }
}

function warning(text: string): HTMLParagraphElement {
  return status(text, "warn");
}

function messageOf(state: Readonly<SaveState>): HTMLParagraphElement {
  switch (state.kind) {
    case "saving":
      return status(TEXT.saving, "plain");
    case "saved":
      return status(TEXT.saved, "ok");
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
    case "updating":
      return warning(TEXT.updating);
    case "unreachable":
      return warning(TEXT.unreachable);
    case "failed":
      return warning(TEXT.failed);
    default:
      return state satisfies never;
  }
}

function redditBlock(view: Readonly<RedditView> | null): HTMLElement[] {
  if (view === null) return [];

  const text = view.kind === "expired" ? TEXT.popupExpired : redditStatusText(view);

  const buttons = redditActions(view)
    .filter((action) => action !== "disconnect")
    .map((action) => button(redditLabel(action), () => void reconnect()));

  return [status(text, redditTone(view)), element("div", { class: "ext-actions" }, ...buttons)];
}

function show(state: Readonly<SaveState>): void {
  latest = state;

  root?.replaceChildren(
    element("h1", {}, "Threadsift"),
    messageOf(state),
    element("div", { class: "ext-actions" }, ...actions(state)),
    ...redditBlock(reddit),
  );
}

function moveReddit(next: RedditView | null): void {
  reddit = next;
  show(latest);
}

async function reconnect(): Promise<void> {
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
