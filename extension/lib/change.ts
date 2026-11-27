import { exclusive, reconcileAccess } from "./access.ts";
import { checkAddress } from "./address-check.ts";
import { type Config, instanceOrigin } from "./config.ts";
import { syncScripts } from "./content-scripts.ts";
import { loadConfig, loadConfigView, storeConfig, storeFill, stored } from "./credentials.ts";
import { cancelFills } from "./fill.ts";
import { logFailure } from "./log.ts";
import type { ChangeAnswer, SettingsRequest } from "./state.ts";

type Written = Exclude<ChangeAnswer["write"], "failed">;

async function writeSave(origin: string, token: string | null): Promise<Written> {
  if (token !== null) {
    await storeConfig({ origin, token });

    return "done";
  }

  const kept = await stored();
  const sameAddress = instanceOrigin(kept.instance ?? "") === origin;

  return sameAddress && kept.token !== undefined && kept.token !== "" ? "done" : "token-needed";
}

async function write(request: Readonly<SettingsRequest>): Promise<Written> {
  if (request.kind === "fill") {
    await storeFill(request.on);

    return "done";
  }

  const origin = instanceOrigin(request.origin);

  if (origin === null) throw new Error("the address is not an Instance origin");

  return writeSave(origin, request.token);
}

async function tryWrite(request: Readonly<SettingsRequest>): Promise<ChangeAnswer["write"]> {
  try {
    return await write(request);
  } catch (cause) {
    logFailure("settings-write-failed", cause);

    return "failed";
  }
}

interface Applied {
  readonly written: ChangeAnswer["write"];
  readonly access: ChangeAnswer["access"];
  readonly stored: ChangeAnswer["stored"];
  readonly checked: Config | null;
}

async function applyChange(request: Readonly<SettingsRequest>): Promise<Applied> {
  const written = await tryWrite(request);

  if (request.kind === "fill" && !request.on) cancelFills();

  const access = await reconcileAccess();
  await syncScripts();

  const checked = written === "done" && request.kind === "save" ? await loadConfig() : null;

  return { written, access, stored: await loadConfigView(), checked };
}

export async function changeSettings(request: Readonly<SettingsRequest>): Promise<ChangeAnswer> {
  const { written, access, stored: view, checked } = await exclusive(() => applyChange(request));

  if (written !== "done") return { write: written, stored: view, access };

  return {
    write: "done",
    stored: view,
    access,
    check: checked === null ? null : await checkAddress(checked),
  };
}
