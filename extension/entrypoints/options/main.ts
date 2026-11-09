import { browser } from "wxt/browser";

import { hostPattern, instanceOrigin, loadConfig, storeConfig } from "../../lib/config.ts";
import { applyLook, element } from "../../lib/page-look.ts";
import { TEXT } from "../../lib/text.ts";

const root = document.querySelector("#root");

if (root === null) throw new Error("the settings page has no root element");

const address = element("input", { id: "address", type: "url", autocomplete: "off" });
const token = element("input", { id: "token", type: "password", autocomplete: "off" });
const result = element("p", { class: "ext-status", role: "status" });

function field(label: string, input: HTMLElement, hint: string): HTMLDivElement {
  return element(
    "div",
    { class: "ext-field" },
    element("label", { for: input.id, class: "label" }, label),
    element("div", { class: "field" }, input),
    element("p", { class: "ext-hint" }, hint),
  );
}

function report(text: string, tone: "ok" | "warn"): void {
  result.textContent = text;
  result.dataset["tone"] = tone;
}

async function saveSettings(): Promise<void> {
  const origin = instanceOrigin(address.value);
  const secret = token.value.trim();

  if (origin === null) {
    report(TEXT.addressInvalid, "warn");

    return;
  }

  if (secret === "") {
    report(TEXT.tokenMissing, "warn");

    return;
  }

  const pattern = hostPattern(origin);

  if (!(await browser.permissions.request({ origins: [pattern] }))) {
    report(TEXT.accessDenied, "warn");

    return;
  }

  const previous = await loadConfig();
  await storeConfig({ origin, token: secret });

  if (previous !== null && hostPattern(previous.origin) !== pattern) {
    await browser.permissions.remove({ origins: [hostPattern(previous.origin)] });
  }

  address.value = origin;
  report(TEXT.settingsSaved, "ok");
}

const form = element(
  "form",
  { class: "ext-form" },
  field(TEXT.addressLabel, address, TEXT.addressHint),
  field(TEXT.tokenLabel, token, TEXT.tokenHint),
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

root.append(element("h1", {}, TEXT.settingsTitle), form);

const config = await loadConfig();

if (config !== null) {
  address.value = config.origin;
  token.value = config.token;
}
