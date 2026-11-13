import { exclusive, reconcileAccess } from "./access.ts";
import { instanceOrigin, storeConfig, storeFill, storeOrigin } from "./config.ts";
import { loadConfigView, stored } from "./credentials.ts";
import { logFailure } from "./log.ts";
import type { ChangeAnswer, SettingsRequest } from "./state.ts";

async function write(request: Readonly<SettingsRequest>): Promise<void> {
  if (request.kind === "fill") {
    await storeFill(request.on);

    return;
  }

  const origin = instanceOrigin(request.origin);

  if (origin === null) throw new Error("the address is not an Instance origin");

  if (request.token !== null) {
    await storeConfig({ origin, token: request.token });

    return;
  }

  const { token } = await stored();

  if (token === undefined || token === "") throw new Error("no agent token is stored to keep");

  await storeOrigin(origin);
}

async function tryWrite(request: Readonly<SettingsRequest>): Promise<ChangeAnswer["write"]> {
  try {
    await write(request);

    return "done";
  } catch (cause) {
    logFailure("settings-write-failed", cause);

    return "failed";
  }
}

export function changeSettings(request: Readonly<SettingsRequest>): Promise<ChangeAnswer> {
  return exclusive(async () => {
    const written = await tryWrite(request);
    const access = await reconcileAccess();

    return { stored: await loadConfigView(), write: written, access };
  });
}
