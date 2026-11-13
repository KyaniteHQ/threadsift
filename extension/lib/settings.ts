import { browser } from "wxt/browser";

import { hostPattern, instanceOrigin } from "./config.ts";
import { logFailure } from "./log.ts";
import {
  ANSWER_DEADLINE_MS,
  CONFIG_PORT,
  type ChangeAnswer,
  ChangeAnswerSchema,
  type ConfigView,
  ConfigViewSchema,
  SETTINGS_PORT,
  type SettingsRequest,
  ask,
} from "./state.ts";

export type Refusal = "address" | "token" | "access";

export type Failure = "not-saved" | "old-access-kept" | "not-saved-access-kept";

export type SettingsState =
  | { readonly kind: "loading" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "idle"; readonly stored: ConfigView }
  | { readonly kind: "saving"; readonly stored: ConfigView }
  | { readonly kind: "saved"; readonly stored: ConfigView }
  | { readonly kind: "refused"; readonly stored: ConfigView; readonly reason: Refusal }
  | { readonly kind: "failed"; readonly stored: ConfigView; readonly step: Failure };

export interface SettingsInput {
  readonly address: string;
  readonly token: string;
}

export async function readStored(): Promise<ConfigView | null> {
  try {
    return await ask(CONFIG_PORT, ConfigViewSchema, { deadlineMs: ANSWER_DEADLINE_MS });
  } catch (cause) {
    logFailure("settings-read-failed", cause);

    return null;
  }
}

export async function requestChange(request: SettingsRequest): Promise<ChangeAnswer | null> {
  try {
    return await ask(SETTINGS_PORT, ChangeAnswerSchema, {
      deadlineMs: ANSWER_DEADLINE_MS,
      request,
    });
  } catch (cause) {
    logFailure("settings-change-failed", cause);

    return null;
  }
}

async function readState(
  make: (stored: Readonly<ConfigView>) => SettingsState,
): Promise<SettingsState> {
  const stored = await readStored();

  return stored === null ? { kind: "unreadable" } : make(stored);
}

export function loadSettings(): Promise<SettingsState> {
  return readState((stored) => ({ kind: "idle", stored }));
}

function failureOf({ write, access }: Readonly<ChangeAnswer>): Failure | null {
  if (write === "done") return access === "kept" ? "old-access-kept" : null;

  return access === "kept" ? "not-saved-access-kept" : "not-saved";
}

function stateOf(answer: Readonly<ChangeAnswer>): SettingsState {
  const step = failureOf(answer);

  return step === null
    ? { kind: "saved", stored: answer.stored }
    : { kind: "failed", stored: answer.stored, step };
}

function notSaved(): Promise<SettingsState> {
  return readState((stored) => ({ kind: "failed", stored, step: "not-saved" }));
}

export async function saveSettings(
  stored: Readonly<ConfigView>,
  { address, token }: Readonly<SettingsInput>,
): Promise<SettingsState> {
  const origin = instanceOrigin(address);
  const secret = token.trim();

  if (origin === null) return { kind: "refused", stored, reason: "address" };

  if (secret === "" && !stored.hasToken) return { kind: "refused", stored, reason: "token" };

  let granted: boolean;

  try {
    granted = await browser.permissions.request({ origins: [hostPattern(origin)] });
  } catch (cause) {
    logFailure("settings-request-failed", cause);

    return notSaved();
  }

  if (!granted) return { kind: "refused", stored, reason: "access" };

  const answer = await requestChange({
    kind: "save",
    origin,
    token: secret === "" ? null : secret,
  });

  return answer === null ? { kind: "unreadable" } : stateOf(answer);
}
