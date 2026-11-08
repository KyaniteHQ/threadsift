import { type APIRequestContext, expect } from "@playwright/test";
import { z } from "zod";

import { type Instance, freshDir, newCode } from "./access.ts";
import { ownerOf } from "./files.ts";
import { eventLines, releaseSweepThrottle, sweepNow } from "./ingest.ts";
import { type Seed, launchSeeded } from "./seeded.ts";
import { isContainerTarget } from "./target.ts";

const Stored = z.array(z.object({ id: z.number(), normalized_url: z.string() }));

const Counts = z.array(z.object({ n: z.number() }));

const Marker = z.array(
  z.object({ name: z.string(), version: z.number(), cursor: z.string().nullable() }),
);

export function stored(instance: Instance) {
  return instance.query("SELECT id, normalized_url FROM items ORDER BY id", Stored);
}

export function count(instance: Instance, statement: string): number {
  return instance.query(`SELECT count(*) AS n FROM (${statement})`, Counts)[0]?.n ?? -1;
}

export function marker(instance: Instance) {
  return instance.query("SELECT name, version, cursor FROM data_steps", Marker);
}

export function lines(instance: Instance, event: string): string[] {
  return eventLines(instance, event, "");
}

export async function started(seed: Seed) {
  const code = newCode();
  const instance = launchSeeded(freshDir(), code, seed);

  return { instance, owner: await ownerOf(instance, code, "m".repeat(20)) };
}

export async function attemptStep(owner: APIRequestContext, instance: Instance) {
  if (isContainerTarget()) {
    instance.restart();

    return;
  }

  releaseSweepThrottle(instance);
  await owner.get("/cdn-cgi/local/scheduled");
}

export async function runStep(owner: APIRequestContext, instance: Instance) {
  await sweepNow(owner, instance);
  await expect
    .poll(() => marker(instance).at(0)?.version ?? 0, { timeout: 90_000 })
    .toBeGreaterThan(0);
}

export async function stoppedBeforeRenames(seed: Seed) {
  const run = await started(seed);

  await attemptStep(run.owner, run.instance);
  await expect
    .poll(() => marker(run.instance).at(0)?.cursor, { timeout: 90_000 })
    .toBe("1|apply:0");

  return run;
}
