import { browser } from "wxt/browser";

import { hostPattern, instanceOrigin, storeConfig, storeOrigin } from "./config.ts";
import { CONFIG_PORT, type ConfigView, ConfigViewSchema, ask } from "./state.ts";

export type Refusal = "address" | "token" | "access";

export type Failure = "not-saved" | "old-access-kept";

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

async function readStored(): Promise<ConfigView | null> {
  try {
    return await ask(CONFIG_PORT, ConfigViewSchema);
  } catch {
    return null;
  }
}

export async function loadSettings(): Promise<SettingsState> {
  const stored = await readStored();

  return stored === null ? { kind: "unreadable" } : { kind: "idle", stored };
}

async function failedAs(step: Failure): Promise<SettingsState> {
  const stored = await readStored();

  return stored === null ? { kind: "unreadable" } : { kind: "failed", stored, step };
}

async function dropAccess(pattern: string): Promise<boolean> {
  try {
    return await browser.permissions.remove({ origins: [pattern] });
  } catch {
    return false;
  }
}

export async function saveSettings(
  stored: Readonly<ConfigView>,
  { address, token }: Readonly<SettingsInput>,
): Promise<SettingsState> {
  const origin = instanceOrigin(address);
  const secret = token.trim();

  if (origin === null) return { kind: "refused", stored, reason: "address" };

  if (secret === "" && !stored.hasToken) return { kind: "refused", stored, reason: "token" };

  const pattern = hostPattern(origin);
  const previous = stored.origin === null ? null : hostPattern(stored.origin);

  try {
    if (!(await browser.permissions.request({ origins: [pattern] }))) {
      return { kind: "refused", stored, reason: "access" };
    }

    if (secret === "") await storeOrigin(origin);
    else await storeConfig({ origin, token: secret });
  } catch {
    if (pattern !== previous) await dropAccess(pattern);

    return failedAs("not-saved");
  }

  if (previous !== null && previous !== pattern && !(await dropAccess(previous))) {
    return failedAs("old-access-kept");
  }

  return { kind: "saved", stored: { origin, hasToken: true } };
}
