import { deferWhileWorking, newestRequest } from "../../lib/newest-request.ts";
import { element, say } from "../../lib/page-look.ts";
import {
  type RedditAction,
  type RedditView,
  connectRedditFromPage,
  disconnectRedditFromPage,
  loadReddit,
  redditActions,
  redditLabel,
  redditStatusText,
  redditTone,
} from "../../lib/reddit-setting.ts";
import { TEXT } from "../../lib/text.ts";

const status = element("p", { class: "ext-status", role: "status" });
const buttons = element("div", { class: "ext-actions" });

export const redditSection = element(
  "section",
  { class: "ext-form", hidden: "" },
  element("h2", {}, TEXT.redditTitle),
  element("p", { class: "ext-hint" }, TEXT.redditHint),
  buttons,
  status,
);

let current: RedditView = { kind: "loading", access: false };
const begin = newestRequest();
const deferral = deferWhileWorking();

function settlePress(answer: RedditView): void {
  if (!deferral.take()) {
    move(answer);

    return;
  }

  move({ kind: "loading", access: false });
  void refreshReddit();
}

function press(action: RedditAction): void {
  if (current.kind === "working") return;

  begin();
  move({ kind: "working", access: false });

  void (action === "disconnect" ? disconnectRedditFromPage() : connectRedditFromPage()).then(
    settlePress,
  );
}

function actionButton(action: RedditAction): HTMLButtonElement {
  const created = element("button", { type: "button", class: "btn btn-acc" }, redditLabel(action));
  created.addEventListener("click", () => {
    press(action);
  });

  return created;
}

function render(view: Readonly<RedditView>): void {
  redditSection.hidden = view.kind === "unavailable" && !view.access;
  say(status, redditStatusText(view), redditTone(view));
  buttons.replaceChildren(...redditActions(view).map((action) => actionButton(action)));
}

function move(next: RedditView): void {
  current = next;
  render(next);
}

export async function refreshReddit(): Promise<void> {
  if (current.kind === "working") {
    deferral.defer();

    return;
  }

  const isNewest = begin();
  const next = await loadReddit();

  if (isNewest()) move(next);
}
