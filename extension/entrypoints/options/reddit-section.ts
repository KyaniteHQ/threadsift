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
let version = 0;

function settlingAt(started: number): (answer: RedditView) => void {
  return (answer) => {
    if (version === started) {
      move(answer);

      return;
    }

    move({ kind: "loading", access: false });
    void refreshReddit();
  };
}

function press(action: RedditAction): void {
  if (current.kind === "working") return;

  move({ kind: "working", access: false });

  const started = version;

  void (action === "disconnect" ? disconnectRedditFromPage() : connectRedditFromPage()).then(
    settlingAt(started),
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
  version += 1;
  current = next;
  render(next);
}

export async function refreshReddit(): Promise<void> {
  if (current.kind === "working") {
    version += 1;

    return;
  }

  const started = version;
  const next = await loadReddit();

  if (started === version) move(next);
}
