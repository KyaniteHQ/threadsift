import { browser } from "wxt/browser";

import { type FillState, loadFill, turnFill } from "../../lib/fill-setting.ts";
import { deferWhileWorking, newestRequest } from "../../lib/newest-request.ts";
import { applyLook, element, say } from "../../lib/page-look.ts";
import {
  type Failure,
  type Refusal,
  type SettingsState,
  loadSettings,
  saveSettings,
} from "../../lib/settings.ts";
import type { ConfigView } from "../../lib/state.ts";
import { TEXT } from "../../lib/text.ts";
import { redditSection, refreshReddit } from "./reddit-section.ts";

const REFUSAL_TEXT: Readonly<Record<Refusal, string>> = {
  address: TEXT.addressInvalid,
  token: TEXT.tokenMissing,
  access: TEXT.accessDenied,
};

const FAILURE_TEXT: Readonly<Record<Failure, string>> = {
  "not-saved": TEXT.settingsNotSaved,
  "old-access-kept": TEXT.oldAccessKept,
  "not-saved-access-kept": TEXT.accessKeptNotSaved,
};

const root = document.querySelector("#root");

if (root === null) throw new Error("the settings page has no root element");

const address = element("input", { id: "address", type: "url", autocomplete: "off" });
const token = element("input", { id: "token", type: "password", autocomplete: "off" });
const tokenHint = element("p", { class: "ext-hint" }, TEXT.tokenHint);
const result = element("p", { class: "ext-status", role: "status" });
const saveButton = element("button", { type: "submit", class: "btn btn-acc" }, TEXT.saveSettings);

const fillStatus = element("p", { class: "ext-status", "aria-live": "polite" });
const fillNote = element("p", { class: "ext-status", role: "status" });
const fillButton = element("button", { type: "button", class: "btn btn-acc" }, TEXT.fillTurnOn);

let settings: SettingsState = { kind: "loading" };
let fill: FillState = { kind: "loading" };
const beginFill = newestRequest();
const fillDeferral = deferWhileWorking();

function field(label: string, input: HTMLElement, hint: HTMLElement): HTMLDivElement {
  return element(
    "div",
    { class: "ext-field" },
    element("label", { for: input.id, class: "label" }, label),
    element("div", { class: "field" }, input),
    hint,
  );
}

function showStored({ origin, hasToken }: Readonly<ConfigView>): void {
  address.value = origin ?? "";
  token.value = "";
  tokenHint.textContent = hasToken ? TEXT.tokenKept : TEXT.tokenHint;
}

function renderSettings(state: Readonly<SettingsState>): void {
  saveButton.disabled =
    state.kind === "loading" || state.kind === "unreadable" || state.kind === "saving";

  switch (state.kind) {
    case "loading":
      say(result, "", "plain");
      break;
    case "unreadable":
      say(result, TEXT.settingsUnreadable, "warn");
      break;
    case "idle":
      showStored(state.stored);
      say(result, "", "plain");
      break;
    case "saving":
      say(result, TEXT.saving, "plain");
      break;
    case "saved":
      showStored(state.stored);
      say(result, TEXT.settingsSaved, "ok");
      break;
    case "refused":
      say(result, REFUSAL_TEXT[state.reason], "warn");
      break;
    case "failed":
      showStored(state.stored);
      say(result, FAILURE_TEXT[state.step], "warn");
      break;
    default: {
      const exhaustive: never = state;

      return exhaustive;
    }
  }
}

function moveSettings(next: SettingsState): void {
  settings = next;
  renderSettings(next);
}

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

function settled(next: SettingsState): void {
  moveSettings(next);
  void refreshReddit();
}

function submitSettings(): void {
  const current = settings;

  if (current.kind === "loading" || current.kind === "unreadable" || current.kind === "saving") {
    return;
  }

  moveSettings({ kind: "saving", stored: current.stored });

  void saveSettings(current.stored, { address: address.value, token: token.value }).then(settled);
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

browser.permissions.onAdded.addListener(() => void followFill());

browser.permissions.onRemoved.addListener(() => void followFill());

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "fill" in changes) void followFill();
});

fillButton.addEventListener("click", pressFill);

const fillSection = element(
  "section",
  { class: "ext-form" },
  element("h2", {}, TEXT.fillTitle),
  element("p", { class: "ext-hint" }, TEXT.fillHint),
  element("div", { class: "ext-actions" }, fillButton),
  fillStatus,
  fillNote,
);

const form = element(
  "form",
  { class: "ext-form" },
  field(TEXT.addressLabel, address, element("p", { class: "ext-hint" }, TEXT.addressHint)),
  field(TEXT.tokenLabel, token, tokenHint),
  element("div", { class: "ext-actions" }, saveButton),
  result,
);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitSettings();
});

applyLook();

renderSettings(settings);

renderFill(fill);

root.append(element("h1", {}, TEXT.settingsTitle), form, fillSection, redditSection);

void followFill();

void refreshReddit();

moveSettings(await loadSettings());
