import { deferWhileWorking, newestRequest } from "../../lib/newest-request.ts";
import { button, element, replaceControls, say } from "../../lib/page-look.ts";
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

const heading = element("h2", { tabindex: "-1" }, TEXT.redditTitle);
const status = element("p", { class: "ext-status", role: "status" });
const buttons = element("div", { class: "ext-actions" });

export const redditSection = element(
  "section",
  { class: "ext-form", hidden: "" },
  heading,
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

function render(view: Readonly<RedditView>): void {
  const hidden = view.kind === "unavailable" && !view.access;

  if (hidden && redditSection.contains(document.activeElement)) {
    const pageHeading = document.querySelector("h1");

    pageHeading?.setAttribute("tabindex", "-1");
    pageHeading?.focus();
  }

  redditSection.hidden = hidden;
  say(status, redditStatusText(view), redditTone(view));
  replaceControls(
    buttons,
    heading,
    redditActions(view).map((action) =>
      button(redditLabel(action), () => {
        press(action);
      }),
    ),
  );
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

export function refreshRedditUnlessPressing(): void {
  if (current.kind !== "working") void refreshReddit();
}
