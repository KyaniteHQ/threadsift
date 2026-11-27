import { browser } from "wxt/browser";

import { INSTANCE_CALL_DEADLINE_MS } from "../../src/core/contract/reddit-relay-contract.ts";
import { hostPattern, instanceOrigin, requestAccess } from "./config.ts";
import { logFailure } from "./log.ts";
import { CHECK_PORT, CONFIG_PORT, SETTINGS_PORT } from "./ports.ts";
import {
  ANSWER_DEADLINE_MS,
  type ChangeAnswer,
  ChangeAnswerSchema,
  CheckAnswerSchema,
  type ConfigView,
  ConfigViewSchema,
  type Reach,
  type SettingsRequest,
  ask,
} from "./state.ts";
import { ERROR_EVENT_WAIT_MS } from "./unreached.ts";

const CHECK_DEADLINE_MS = INSTANCE_CALL_DEADLINE_MS + ERROR_EVENT_WAIT_MS + ANSWER_DEADLINE_MS;

export type Refusal = "address" | "token" | "access";

export type Failure = "not-saved" | "not-saved-access-kept";

export type SettingsState =
  | { readonly kind: "loading" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "idle"; readonly stored: ConfigView }
  | { readonly kind: "saving"; readonly stored: ConfigView }
  | { readonly kind: "checking"; readonly stored: ConfigView; readonly accessKept: boolean }
  | {
      readonly kind: "checked";
      readonly stored: ConfigView;
      readonly reach: Reach;
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
  const stored = await askConfigView();

  return stored === null ? { kind: "unreadable" } : make(stored);
}

export function loadSettings(): Promise<SettingsState> {
  return readState((stored) => ({ kind: "idle", stored }));
}

function stateOf({ stored, write, access }: Readonly<ChangeAnswer>): SettingsState {
  const accessKept = access === "kept";

  if (write === "done") return { kind: "checking", stored, accessKept };

  return { kind: "failed", stored, step: accessKept ? "not-saved-access-kept" : "not-saved" };
}

function notSaved(): Promise<SettingsState> {
  return readState((stored) => ({ kind: "failed", stored, step: "not-saved" }));
}

export function tokenMissing(stored: Readonly<ConfigView>, token: string): boolean {
  return token.trim() === "" && !stored.hasToken;
}

export async function saveSettings(
  stored: Readonly<ConfigView>,
  { address, token }: Readonly<SettingsInput>,
): Promise<SettingsState> {
  const origin = instanceOrigin(address);
  const secret = token.trim();

  if (origin === null) return { kind: "refused", stored, reason: "address" };

  if (tokenMissing(stored, token)) return { kind: "refused", stored, reason: "token" };

  const granted = await requestAccess(
    () =>
      browser.permissions.request({
        permissions: ["webRequest"],
        origins: [hostPattern(origin)],
      }),
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

async function askReach(): Promise<Reach> {
  try {
    return (await ask(CHECK_PORT, CheckAnswerSchema, { deadlineMs: CHECK_DEADLINE_MS })).reach;
  } catch (cause) {
    logFailure("address-check-unanswered", cause);

    return "check-failed";
  }
}

export async function checkSaved({
  stored,
  accessKept,
}: Readonly<Extract<SettingsState, { kind: "checking" }>>): Promise<SettingsState> {
  return { kind: "checked", stored, reach: await askReach(), accessKept };
}
