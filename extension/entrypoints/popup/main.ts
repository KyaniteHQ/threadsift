import { browser } from "wxt/browser";

import { applyLook, button, element, replaceControls, say } from "../../lib/page-look.ts";
import { SAVE_PORT } from "../../lib/ports.ts";
import {
  type RedditView,
  loadReddit,
  reconnectFromPopup,
  redditActions,
  redditLabel,
  redditStatusText,
  redditTone,
} from "../../lib/reddit-setting.ts";
import { SAVE_STATE_FACTS, opensItem } from "../../lib/save-state-facts.ts";
import { type SaveState, SaveStateSchema, ask } from "../../lib/state.ts";
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

function openItem(itemUrl: string): HTMLAnchorElement {
  return element(
    "a",
    { class: "btn btn-acc", href: itemUrl, target: "_blank", rel: "noreferrer" },
    TEXT.openItem,
  );
}

function actions(state: Readonly<SaveState>): HTMLElement[] {
  if (opensItem(state)) return [openItem(state.itemUrl)];

  const { action } = SAVE_STATE_FACTS[state.kind];

  switch (action) {
    case "settings":
      return [button(TEXT.openSettings, () => void browser.runtime.openOptionsPage())];
    case "retry":
      return [button(TEXT.tryAgain, () => void save())];
    case "none":
      return [];
    default:
      return action satisfies never;
  }
}

function show(state: Readonly<SaveState>): void {
  const { text, tone } = SAVE_STATE_FACTS[state.kind];

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
