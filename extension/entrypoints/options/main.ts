import { browser } from "wxt/browser";

import { hostPattern, instanceOrigin, storeConfig, storeOrigin } from "../../lib/config.ts";
import { applyLook, element } from "../../lib/page-look.ts";
import { CONFIG_PORT, type ConfigView, ConfigViewSchema } from "../../lib/state.ts";
import { TEXT } from "../../lib/text.ts";

const root = document.querySelector("#root");

if (root === null) throw new Error("the settings page has no root element");

const address = element("input", { id: "address", type: "url", autocomplete: "off" });
const token = element("input", { id: "token", type: "password", autocomplete: "off" });
const tokenHint = element("p", { class: "ext-hint" }, TEXT.tokenHint);
const result = element("p", { class: "ext-status", role: "status" });

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

root.append(element("h1", {}, TEXT.settingsTitle), form);
