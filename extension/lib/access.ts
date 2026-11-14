import { browser } from "wxt/browser";
import { z } from "zod";

import { REDDIT_HOSTS, holdsRedditConnect, hostPattern, instanceOrigin } from "./config.ts";
import { settleFill, stored } from "./credentials.ts";
import { logFailure } from "./log.ts";

export type AccessResult = "reconciled" | "kept";

export function oneAtATime(): <Result>(task: () => Promise<Result>) => Promise<Result> {
  let queue: Promise<unknown> = Promise.resolve();

  return (task) => {
    const run = queue.then(task);
    queue = run.catch(() => {});

    return run;
  };
}

export const exclusive = oneAtATime();

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

async function dropOrigin(origin: string): Promise<boolean> {
  try {
    if (await browser.permissions.remove({ origins: [origin] })) return true;

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

  const dropped = await Promise.all(stale.map((origin) => dropOrigin(origin)));

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
