import { instanceOrigin } from "../../lib/config.ts";
import { element, say } from "../../lib/page-look.ts";
import {
  type Failure,
  type Refusal,
  type SettingsState,
  loadSettings,
  saveSettings,
  tokenRefusal,
} from "../../lib/settings.ts";
import type { AddressCheck, ConfigView } from "../../lib/state.ts";
import { TEXT } from "../../lib/text.ts";
import { refreshReddit, withdrawReddit } from "./reddit-section.ts";

const REFUSAL_TEXT: Readonly<Record<Refusal, string>> = {
  address: TEXT.addressInvalid,
  token: TEXT.tokenMissing,
  "new-address-token": TEXT.tokenForNewAddress,
  access: TEXT.accessDenied,
};

const FAILURE_TEXT: Readonly<Record<Failure, string>> = {
  "not-saved": TEXT.settingsNotSaved,
  "not-saved-access-kept": TEXT.accessKeptNotSaved,
};

const CHECK_TEXT: Readonly<Record<AddressCheck, string>> = {
  works: TEXT.checkWorks,
  "name-not-found": TEXT.checkNameNotFound,
  "connection-refused": TEXT.checkConnectionRefused,
  "timed-out": TEXT.checkTimedOut,
  "secure-connection-failed": TEXT.checkSecureConnection,
  unreachable: TEXT.checkUnreachable,
  "not-instance": TEXT.checkNotInstance,
  "instance-outdated": TEXT.checkInstanceOutdated,
  "token-refused": TEXT.checkTokenRefused,
  "scope-refused": TEXT.checkScopeRefused,
  "check-failed": TEXT.checkFailed,
};

const address = element("input", { id: "address", type: "url", autocomplete: "off" });
const token = element("input", { id: "token", type: "password", autocomplete: "off" });
const addressHint = element("p", { id: "address-hint", class: "ext-hint" }, TEXT.addressHint);
const tokenHint = element("p", { id: "token-hint", class: "ext-hint" }, TEXT.tokenHint);
const result = element("p", { id: "settings-result", class: "ext-status", role: "status" });

type Saved = Extract<SettingsState, { kind: "saved" }>;

type SettingsField = Readonly<Record<"input" | "hint", HTMLElement>>;

const fields: Readonly<Record<"address" | "token", SettingsField>> = {
  address: { input: address, hint: addressHint },
  token: { input: token, hint: tokenHint },
};

const saveButton = element("button", { type: "submit", class: "btn btn-acc" }, TEXT.saveSettings);

let settings: SettingsState = { kind: "loading" };
let revision = 0;
let submittedRevision = 0;

function changedSinceSubmit(): boolean {
  return revision !== submittedRevision;
}

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

const READS_REDDIT: ReadonlySet<AddressCheck> = new Set(["works", "scope-refused"]);

function checkText({ check, accessKept }: Readonly<Saved>): string {
  if (changedSinceSubmit()) return TEXT.checkStale;

  return accessKept ? `${CHECK_TEXT[check]} ${TEXT.accessNotRemoved}` : CHECK_TEXT[check];
}

function showSaved(state: Readonly<Saved>): void {
  const settled = state.check === "works" && !changedSinceSubmit();

  if (settled) showStored(state.stored);
  else showTokenHint(state.stored);

  say(result, checkText(state), settled && !state.accessKept ? "ok" : "warn");
}

function refusedField(state: Readonly<SettingsState>): SettingsField | null {
  if (state.kind !== "refused") return null;

  switch (state.reason) {
    case "address":
      return fields.address;
    case "token":
    case "new-address-token":
      return fields.token;
    case "access":
      return null;
    default:
      return state.reason satisfies never;
  }
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
  const missingToken =
    state.kind === "refused" &&
    tokenRefusal(state.stored, instanceOrigin(address.value), token.value) !== null;

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
    case "saved":
      showSaved(state);
      break;
    case "refused":
      say(result, REFUSAL_TEXT[state.reason], "warn");

      if (refusedInput !== null) refusedInput.focus();
      break;
    case "failed":
      if (!changedSinceSubmit()) showStored(state.stored);
      say(result, FAILURE_TEXT[state.step], "warn");
      break;
    default: {
      const exhaustive: never = state;

      return exhaustive;
    }
  }
}

type Busy = Extract<SettingsState, { kind: "loading" | "unreadable" | "saving" }>;

function isBusy(state: Readonly<SettingsState>): state is Readonly<Busy> {
  return state.kind === "loading" || state.kind === "unreadable" || state.kind === "saving";
}

function moveSettings(next: SettingsState): void {
  settings = next;
  renderSettings(next);
}

function followReddit(state: Readonly<SettingsState>): void {
  if (state.kind !== "saved") return;

  if (READS_REDDIT.has(state.check)) void refreshReddit();
  else withdrawReddit();
}

function restoreFocus(focused: Element | null): void {
  const lost = document.activeElement === null || document.activeElement === document.body;

  if (lost && focused instanceof HTMLElement && focused.isConnected) focused.focus();
}

async function saveAndCheck(stored: Readonly<ConfigView>): Promise<void> {
  const focused = document.activeElement;
  const next = await saveSettings(stored, { address: address.value, token: token.value });

  moveSettings(next);
  followReddit(next);
  restoreFocus(focused);
}

function submitSettings(): void {
  const current = settings;

  if (isBusy(current)) return;

  submittedRevision = revision;
  moveSettings({ kind: "saving", stored: current.stored });

  void saveAndCheck(current.stored);
}

function fieldChanged(): void {
  revision += 1;
  markFields(settings);
}

address.addEventListener("input", fieldChanged);

token.addEventListener("input", fieldChanged);

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
