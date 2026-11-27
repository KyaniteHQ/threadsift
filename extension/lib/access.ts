import { browser } from "wxt/browser";
import { z } from "zod";

import { REDDIT_HOSTS, holdsRedditConnect, hostPattern, instanceOrigin } from "./config.ts";
import { settleFill, stored } from "./credentials.ts";
import { FILL_DATA } from "./fill-access.ts";
import { logFailure } from "./log.ts";
import { oneAtATime } from "./one-at-a-time.ts";

type AccessResult = "reconciled" | "kept";

export const exclusive = oneAtATime();

export function onPermissionsChanged(listener: () => void): void {
  browser.permissions.onAdded.addListener(listener);
  browser.permissions.onRemoved.addListener(listener);
}

const ManifestSchema = z.object({
  host_permissions: z.array(z.string()).nullish(),
  content_scripts: z.array(z.object({ matches: z.array(z.string()).nullish() })).nullish(),
});

function requiredOrigins(): ReadonlySet<string> {
  const { host_permissions: hosts, content_scripts: scripts } = ManifestSchema.parse(
    browser.runtime.getManifest(),
  );

  return new Set([...(hosts ?? []), ...(scripts ?? []).flatMap(({ matches }) => matches ?? [])]);
}

async function neededOrigins(): Promise<ReadonlySet<string>> {
  const { instance, fill } = await stored();
  const origin = instanceOrigin(instance ?? "");
  const needed = new Set<string>(origin === null ? [] : [hostPattern(origin)]);

  const keepReddit = fill === true || (await holdsRedditConnect());

  if (keepReddit) for (const host of REDDIT_HOSTS) needed.add(host);

  return needed;
}

async function drop(remove: () => Promise<boolean>): Promise<boolean> {
  try {
    if (await remove()) return true;

    logFailure("access-remove-refused", new Error("permissions.remove resolved false"));

    return false;
  } catch (cause) {
    logFailure("access-remove-failed", cause);

    return false;
  }
}

async function reconcile(): Promise<AccessResult> {
  await settleFill();

  const [needed, held] = await Promise.all([neededOrigins(), browser.permissions.getAll()]);
  const required = requiredOrigins();

  const stale = (held.origins ?? []).filter(
    (origin) => !needed.has(origin) && !required.has(origin),
  );

  const data = FILL_DATA;
  const dropData =
    data !== null && (await stored()).fill !== true && (await browser.permissions.contains(data));

  const dropped = await Promise.all([
    ...stale.map((origin) => drop(() => browser.permissions.remove({ origins: [origin] }))),
    ...(dropData ? [drop(() => browser.permissions.remove(data))] : []),
  ]);

  return dropped.every(Boolean) ? "reconciled" : "kept";
}

export async function reconcileAccess(): Promise<AccessResult> {
  try {
    return await reconcile();
  } catch (cause) {
    logFailure("access-reconcile-failed", cause);

    return "kept";
  }
}
