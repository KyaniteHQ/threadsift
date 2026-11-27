import { browser } from "wxt/browser";

import { INSTANCE_CALL_DEADLINE_MS } from "../../src/core/contract/reddit-relay-contract.ts";
import { hostPattern, instanceOrigin, requestAccess } from "./config.ts";
import { logFailure } from "./log.ts";
import { CONFIG_PORT, SETTINGS_PORT } from "./ports.ts";
import {
  ANSWER_DEADLINE_MS,
  type AddressCheck,
  type ChangeAnswer,
  ChangeAnswerSchema,
  type ConfigView,
  ConfigViewSchema,
  ERROR_EVENT_WAIT_MS,
  type SettingsRequest,
  ask,
} from "./state.ts";

const SAVE_DEADLINE_MS = ANSWER_DEADLINE_MS + INSTANCE_CALL_DEADLINE_MS + ERROR_EVENT_WAIT_MS;

export type Refusal = "address" | "token" | "new-address-token" | "access";

export type Failure = "not-saved" | "not-saved-access-kept";

export type SettingsState =
  | { readonly kind: "loading" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "idle"; readonly stored: ConfigView }
  | { readonly kind: "saving"; readonly stored: ConfigView }
  | {
      readonly kind: "saved";
      readonly stored: ConfigView;
      readonly check: AddressCheck;
      readonly accessKept: boolean;
    }
  | { readonly kind: "refused"; readonly stored: ConfigView; readonly reason: Refusal }
  | { readonly kind: "failed"; readonly stored: ConfigView; readonly step: Failure };

interface SettingsInput {
  readonly address: string;
  readonly token: string;
}

export async function askConfigView(): Promise<ConfigView | null> {
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
      deadlineMs: request.kind === "save" ? SAVE_DEADLINE_MS : ANSWER_DEADLINE_MS,
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
  const stored = await askConfigView();

  return stored === null ? { kind: "unreadable" } : make(stored);
}

export function loadSettings(): Promise<SettingsState> {
  return readState((stored) => ({ kind: "idle", stored }));
}

function stateOf(answer: Readonly<ChangeAnswer>): SettingsState {
  const { stored } = answer;
  const accessKept = answer.access === "kept";

  switch (answer.write) {
    case "done":
      return { kind: "saved", stored, check: answer.check ?? "check-failed", accessKept };
    case "token-needed":
      return { kind: "refused", stored, reason: "new-address-token" };
    case "failed":
      return { kind: "failed", stored, step: accessKept ? "not-saved-access-kept" : "not-saved" };
    default:
      return answer satisfies never;
  }
}

function notSaved(): Promise<SettingsState> {
  return readState((stored) => ({ kind: "failed", stored, step: "not-saved" }));
}

export function tokenRefusal(
  stored: Readonly<ConfigView>,
  origin: string | null,
  token: string,
): Extract<Refusal, "token" | "new-address-token"> | null {
  if (token.trim() !== "") return null;

  if (!stored.hasToken) return "token";

  return origin === stored.origin ? null : "new-address-token";
}

export async function saveSettings(
  stored: Readonly<ConfigView>,
  { address, token }: Readonly<SettingsInput>,
): Promise<SettingsState> {
  const origin = instanceOrigin(address);
  const secret = token.trim();

  if (origin === null) return { kind: "refused", stored, reason: "address" };

  const missing = tokenRefusal(stored, origin, token);

  if (missing !== null) return { kind: "refused", stored, reason: missing };

  const granted = await requestAccess(
    () => browser.permissions.request({ origins: [hostPattern(origin)] }),
    "settings-request-failed",
  );

  if (granted === null) return notSaved();

  if (!granted) return { kind: "refused", stored, reason: "access" };

  const answer = await requestChange({
    kind: "save",
    origin,
    token: secret === "" ? null : secret,
  });

  return answer === null ? { kind: "unreadable" } : stateOf(answer);
}
