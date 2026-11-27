import { instanceOrigin } from "../../lib/config.ts";
import { element, say } from "../../lib/page-look.ts";
import {
  type Failure,
  type Refusal,
  type SettingsState,
  checkSaved,
  loadSettings,
  saveSettings,
  tokenMissing,
} from "../../lib/settings.ts";
import type { ConfigView, Reach } from "../../lib/state.ts";
import { TEXT } from "../../lib/text.ts";
import { refreshReddit } from "./reddit-section.ts";

const REFUSAL_TEXT: Readonly<Record<Refusal, string>> = {
  address: TEXT.addressInvalid,
  token: TEXT.tokenMissing,
  access: TEXT.accessDenied,
};

const FAILURE_TEXT: Readonly<Record<Failure, string>> = {
  "not-saved": TEXT.settingsNotSaved,
  "not-saved-access-kept": TEXT.accessKeptNotSaved,
};

const REACH_TEXT: Readonly<Record<Reach, string>> = {
  works: TEXT.checkWorks,
  "name-not-found": TEXT.checkNameNotFound,
  "connection-refused": TEXT.checkConnectionRefused,
  "timed-out": TEXT.checkTimedOut,
  "certificate-refused": TEXT.checkCertificateRefused,
  unreachable: TEXT.checkUnreachable,
  "not-instance": TEXT.checkNotInstance,
  "token-refused": TEXT.checkTokenRefused,
  "scope-refused": TEXT.checkScopeRefused,
  "check-failed": TEXT.checkFailed,
};

const address = element("input", { id: "address", type: "url", autocomplete: "off" });
const token = element("input", { id: "token", type: "password", autocomplete: "off" });
const addressHint = element("p", { id: "address-hint", class: "ext-hint" }, TEXT.addressHint);
const tokenHint = element("p", { id: "token-hint", class: "ext-hint" }, TEXT.tokenHint);
const result = element("p", { id: "settings-result", class: "ext-status", role: "status" });

type SettingsField = Readonly<Record<"input" | "hint", HTMLElement>>;

const fields: Readonly<Record<"address" | "token", SettingsField>> = {
  address: { input: address, hint: addressHint },
  token: { input: token, hint: tokenHint },
};

const saveButton = element("button", { type: "submit", class: "btn btn-acc" }, TEXT.saveSettings);

let settings: SettingsState = { kind: "loading" };

function field(label: string, input: HTMLElement, hint: HTMLElement): HTMLDivElement {
  return element(
    "div",
    { class: "ext-field" },
    element("label", { for: input.id, class: "label" }, label),
    hint,
    element("div", { class: "field" }, input),
  );
}

function showTokenHint({ hasToken }: Readonly<ConfigView>): void {
  tokenHint.textContent = hasToken ? TEXT.tokenKept : TEXT.tokenHint;
}

function showStored(stored: Readonly<ConfigView>): void {
  address.value = stored.origin ?? "";
  token.value = "";
  showTokenHint(stored);
}

function showChecked({
  stored,
  reach,
  accessKept,
}: Readonly<Extract<SettingsState, { kind: "checked" }>>): void {
  if (reach === "works") showStored(stored);
  else showTokenHint(stored);

  const text = accessKept ? `${REACH_TEXT[reach]} ${TEXT.accessNotRemoved}` : REACH_TEXT[reach];

  say(result, text, reach === "works" && !accessKept ? "ok" : "warn");
}

function refusedField(state: Readonly<SettingsState>): SettingsField | null {
  return state.kind === "refused" && state.reason !== "access" ? fields[state.reason] : null;
}

function markRefused({ input, hint }: SettingsField, refused: boolean): void {
  if (refused) {
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", `${hint.id} ${result.id}`);
  } else {
    input.removeAttribute("aria-invalid");
    input.setAttribute("aria-describedby", hint.id);
  }
}

function markFields(state: Readonly<SettingsState>): void {
  const refused = refusedField(state);
  const missingToken = state.kind === "refused" && tokenMissing(state.stored, token.value);

  markRefused(fields.address, refused === fields.address && instanceOrigin(address.value) === null);
  markRefused(fields.token, refused === fields.token && missingToken);
}

function renderSettings(state: Readonly<SettingsState>): void {
  saveButton.disabled = isBusy(state);

  const refusedInput = refusedField(state)?.input ?? null;

  result.setAttribute(
    "aria-live",
    refusedInput !== null && document.activeElement !== refusedInput ? "off" : "polite",
  );
  markFields(state);

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
    case "checking":
      showTokenHint(state.stored);
      say(result, TEXT.settingsChecking, "plain");
      break;
    case "checked":
      showChecked(state);
      break;
    case "refused":
      say(result, REFUSAL_TEXT[state.reason], "warn");

      if (refusedInput !== null) refusedInput.focus();
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

type Busy = Extract<SettingsState, { kind: "loading" | "unreadable" | "saving" | "checking" }>;

function isBusy(state: Readonly<SettingsState>): state is Readonly<Busy> {
  return (
    state.kind === "loading" ||
    state.kind === "unreadable" ||
    state.kind === "saving" ||
    state.kind === "checking"
  );
}

function moveSettings(next: SettingsState): void {
  settings = next;
  renderSettings(next);
}

async function saveAndCheck(stored: Readonly<ConfigView>): Promise<void> {
  const saved = await saveSettings(stored, { address: address.value, token: token.value });

  moveSettings(saved);
  void refreshReddit();

  if (saved.kind === "checking") moveSettings(await checkSaved(saved));
}

function submitSettings(): void {
  const current = settings;

  if (isBusy(current)) return;

  moveSettings({ kind: "saving", stored: current.stored });

  void saveAndCheck(current.stored);
}

address.addEventListener("input", () => {
  markFields(settings);
});

token.addEventListener("input", () => {
  markFields(settings);
});

const form = element(
  "form",
  { class: "ext-form" },
  field(TEXT.addressLabel, address, addressHint),
  field(TEXT.tokenLabel, token, tokenHint),
  element("div", { class: "ext-actions" }, saveButton),
  result,
);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitSettings();
});

renderSettings(settings);

export const settingsForm = form;

export async function loadSettingsForm(): Promise<void> {
  moveSettings(await loadSettings());
}
