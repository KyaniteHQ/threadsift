import { browser } from "wxt/browser";

import { onPermissionsChanged } from "../../lib/access.ts";
import { type FillState, loadFill, turnFill } from "../../lib/fill-setting.ts";
import { deferWhileWorking, newestRequest } from "../../lib/newest-request.ts";
import { applyLook, button, element, say } from "../../lib/page-look.ts";
import { FILL_KEY } from "../../lib/stored-keys.ts";
import { TEXT } from "../../lib/text.ts";
import { redditSection, refreshReddit, refreshRedditUnlessPressing } from "./reddit-section.ts";
import { loadSettingsForm, settingsForm } from "./settings-section.ts";

const root = document.querySelector("#root");

if (root === null) throw new Error("the settings page has no root element");

const fillStatus = element("p", { class: "ext-status", "aria-live": "polite" });
const fillNote = element("p", { class: "ext-status", role: "status" });
const fillButton = button(TEXT.fillTurnOn, pressFill);

let fill: FillState = { kind: "loading" };
const beginFill = newestRequest();
const fillDeferral = deferWhileWorking();

function labelFill(on: boolean): void {
  fillButton.textContent = on ? TEXT.fillTurnOff : TEXT.fillTurnOn;
  say(fillStatus, on ? TEXT.fillIsOn : TEXT.fillIsOff, on ? "ok" : "plain");
}

function renderFill(state: Readonly<FillState>): void {
  fillButton.disabled =
    state.kind === "loading" || state.kind === "unreadable" || state.kind === "working";

  switch (state.kind) {
    case "loading":
      say(fillStatus, "", "plain");
      say(fillNote, "", "plain");
      break;
    case "unreadable":
      say(fillStatus, "", "plain");
      say(fillNote, TEXT.fillUnreadable, "warn");
      break;
    case "idle":
    case "working":
      labelFill(state.on);
      say(fillNote, "", "plain");
      break;
    case "denied":
      labelFill(state.on);
      say(fillNote, TEXT.fillDenied, "warn");
      break;
    case "failed":
      labelFill(state.on);
      say(fillNote, TEXT.fillFailed, "warn");
      break;
    default: {
      const exhaustive: never = state;

      return exhaustive;
    }
  }
}

function moveFill(next: FillState): void {
  fill = next;
  renderFill(next);
}

function settleFillPress(answer: FillState): void {
  moveFill(answer);

  if (fillDeferral.take()) void followFill();
}

function pressFill(): void {
  const current = fill;

  if (current.kind === "loading" || current.kind === "unreadable" || current.kind === "working") {
    return;
  }

  beginFill();
  moveFill({ kind: "working", on: current.on });

  void turnFill(!current.on).then(settleFillPress);
}

function fillIsWorking(): boolean {
  return fill.kind === "working";
}

async function followFill(): Promise<void> {
  if (fillIsWorking()) {
    fillDeferral.defer();

    return;
  }

  const isNewest = beginFill();
  const next = await loadFill();

  if (isNewest()) moveFill(next);
}

onPermissionsChanged(() => {
  refreshRedditUnlessPressing();
  void followFill();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && FILL_KEY in changes) void followFill();
});

const fillSection = element(
  "section",
  { class: "ext-form" },
  element("h2", {}, TEXT.fillTitle),
  element("p", { class: "ext-hint" }, TEXT.fillHint),
  element("div", { class: "ext-actions" }, fillButton),
  fillStatus,
  fillNote,
);

applyLook();

renderFill(fill);

root.append(element("h1", {}, TEXT.settingsTitle), settingsForm, fillSection, redditSection);

void followFill();

void refreshReddit();

await loadSettingsForm();
