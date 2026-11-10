import { browser } from "wxt/browser";

import {
  REDDIT_HOSTS,
  hostPattern,
  instanceOrigin,
  storeConfig,
  storeOrigin,
} from "../../lib/config.ts";
import { hasRedditAccess } from "../../lib/fill-script.ts";
import { applyLook, element } from "../../lib/page-look.ts";
import { CONFIG_PORT, type ConfigView, ConfigViewSchema } from "../../lib/state.ts";
import { TEXT } from "../../lib/text.ts";

const root = document.querySelector("#root");

if (root === null) throw new Error("the settings page has no root element");

const address = element("input", { id: "address", type: "url", autocomplete: "off" });
const token = element("input", { id: "token", type: "password", autocomplete: "off" });
const tokenHint = element("p", { class: "ext-hint" }, TEXT.tokenHint);
const result = element("p", { class: "ext-status", role: "status" });

const fillStatus = element("p", { class: "ext-status", "aria-live": "polite" });
const fillButton = element("button", { type: "button", class: "btn btn-acc" });
let fillOn = await hasRedditAccess();

function requestView(): Promise<ConfigView> {
  const port = browser.runtime.connect({ name: CONFIG_PORT });

  return new Promise((resolve, reject) => {
    port.onMessage.addListener((message) => {
      const view = ConfigViewSchema.safeParse(message);
      port.disconnect();

      if (view.success) resolve(view.data);
      else reject(new Error("the background worker sent an unreadable settings view"));
    });

    port.onDisconnect.addListener(() => {
      reject(new Error("the background worker closed the settings port"));
    });
  });
}

function field(label: string, input: HTMLElement, hint: HTMLElement): HTMLDivElement {
  return element(
    "div",
    { class: "ext-field" },
    element("label", { for: input.id, class: "label" }, label),
    element("div", { class: "field" }, input),
    hint,
  );
}

function report(text: string, tone: "ok" | "warn"): void {
  result.textContent = text;
  result.dataset["tone"] = tone;
}

function show({ origin, hasToken }: Readonly<ConfigView>): void {
  address.value = origin ?? "";
  token.value = "";
  tokenHint.textContent = hasToken ? TEXT.tokenKept : TEXT.tokenHint;
}

let view = await requestView();

async function saveSettings(): Promise<void> {
  const origin = instanceOrigin(address.value);
  const secret = token.value.trim();

  if (origin === null) {
    report(TEXT.addressInvalid, "warn");

    return;
  }

  if (secret === "" && !view.hasToken) {
    report(TEXT.tokenMissing, "warn");

    return;
  }

  const pattern = hostPattern(origin);

  if (!(await browser.permissions.request({ origins: [pattern] }))) {
    report(TEXT.accessDenied, "warn");

    return;
  }

  if (secret === "") await storeOrigin(origin);
  else await storeConfig({ origin, token: secret });

  if (view.origin !== null && hostPattern(view.origin) !== pattern) {
    await browser.permissions.remove({ origins: [hostPattern(view.origin)] });
  }

  view = { origin, hasToken: true };
  show(view);
  report(TEXT.settingsSaved, "ok");
}

function showFill(): void {
  fillStatus.textContent = fillOn ? TEXT.fillIsOn : TEXT.fillIsOff;
  fillStatus.dataset["tone"] = fillOn ? "ok" : "plain";
  fillButton.textContent = fillOn ? TEXT.fillTurnOff : TEXT.fillTurnOn;
}

async function turnFill(): Promise<void> {
  if (fillOn) {
    await browser.permissions.remove({ origins: REDDIT_HOSTS });
  } else if (!(await browser.permissions.request({ origins: REDDIT_HOSTS }))) {
    fillStatus.textContent = TEXT.fillDenied;
    fillStatus.dataset["tone"] = "warn";

    return;
  }

  fillOn = await hasRedditAccess();
  showFill();
}

async function followGrant(): Promise<void> {
  fillOn = await hasRedditAccess();
  showFill();
}

browser.permissions.onAdded.addListener(() => void followGrant());

browser.permissions.onRemoved.addListener(() => void followGrant());

fillButton.addEventListener("click", () => {
  void turnFill();
});

const fillSection = element(
  "section",
  { class: "ext-form" },
  element("h2", {}, TEXT.fillTitle),
  element("p", { class: "ext-hint" }, TEXT.fillHint),
  element("div", { class: "ext-actions" }, fillButton),
  fillStatus,
);

const form = element(
  "form",
  { class: "ext-form" },
  field(TEXT.addressLabel, address, element("p", { class: "ext-hint" }, TEXT.addressHint)),
  field(TEXT.tokenLabel, token, tokenHint),
  element(
    "div",
    { class: "ext-actions" },
    element("button", { type: "submit", class: "btn btn-acc" }, TEXT.saveSettings),
  ),
  result,
);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveSettings();
});

applyLook();

show(view);

showFill();

root.append(element("h1", {}, TEXT.settingsTitle), form, fillSection);
