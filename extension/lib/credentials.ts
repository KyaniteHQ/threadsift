import { browser } from "wxt/browser";

import { type Config, hasRedditAccess, instanceOrigin } from "./config.ts";
import { logFailure } from "./log.ts";
import type { ConfigView } from "./state.ts";
import { type Stored, StoredSchema } from "./stored-keys.ts";

const STORED_KEYS = StoredSchema.keyof().options;

export async function stored(): Promise<Stored> {
  const read = StoredSchema.safeParse(await browser.storage.local.get([...STORED_KEYS]));

  return read.success ? read.data : {};
}

function write(change: Readonly<Stored>): Promise<void> {
  return browser.storage.local.set(change);
}

export function storeConfig({ origin, token }: Readonly<Config>): Promise<void> {
  return write({ instance: origin, token });
}

export function storeFill(on: boolean): Promise<void> {
  return write({ fill: on });
}

export async function restrictStorage(): Promise<void> {
  try {
    if ("setAccessLevel" in browser.storage.local) {
      await browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    }
  } catch (cause) {
    logFailure("storage-restrict-failed", cause);
  }
}

async function fillWanted(): Promise<boolean> {
  return (await stored()).fill === true;
}

export async function fillActive(): Promise<boolean> {
  return (await hasRedditAccess()) && (await fillWanted());
}

export async function settleFill(): Promise<void> {
  const { fill } = await stored();
  const granted = await hasRedditAccess();
  const settled = fill === true && granted;

  if (settled !== fill) await storeFill(settled);
}

export async function loadConfig(): Promise<Config | null> {
  const { instance, token } = await stored();
  const origin = instanceOrigin(instance ?? "");

  return origin !== null && token !== undefined && token !== "" ? { origin, token } : null;
}

export async function loadConfigView(): Promise<ConfigView> {
  const { instance, token } = await stored();

  return {
    origin: instanceOrigin(instance ?? ""),
    hasToken: token !== undefined && token !== "",
    fill: await fillActive(),
  };
}
