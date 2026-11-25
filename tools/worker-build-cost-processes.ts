import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

import { z } from "zod";

import { pause } from "../src/core/contract/pause.ts";
import { errnoCodeOf } from "../src/core/kernel/failure-log.ts";
import { signalGroup } from "../src/targets/node/cli-process.ts";
import { throwFirstFailure } from "./attempt-every.ts";

const STOP_DEADLINE_MS = 10_000;
const KILL_DEADLINE_MS = 2000;
const STOP_POLL_MS = 100;
export const ProcessIdSchema = z.number().int().positive();
export const WORKER_HOST = "127.0.0.1";
export const ROOT = resolve(import.meta.dirname, "..");

export function running(target: number): boolean {
  try {
    process.kill(target, 0);

    return true;
  } catch (error) {
    if (errnoCodeOf(error) === "ESRCH") return false;
    if (errnoCodeOf(error) === "EPERM") return true;

    throw error;
  }
}

function signalGroups(groups: readonly number[], signal: "SIGTERM" | "SIGKILL"): unknown[] {
  return groups.flatMap((group) => {
    try {
      signalGroup(group, signal);

      return [];
    } catch (error) {
      return [error];
    }
  });
}

async function survivors(groups: readonly number[], deadline: number): Promise<number[]> {
  const alive = groups.filter((group) => running(-group));

  if (alive.length === 0 || Date.now() > deadline) return alive;
  await pause(STOP_POLL_MS);

  return survivors(alive, deadline);
}

export async function stopGroups(groups: readonly number[]): Promise<void> {
  const failures = signalGroups(groups, "SIGTERM");
  const lasting = await survivors(groups, Date.now() + STOP_DEADLINE_MS);

  failures.push(...signalGroups(lasting, "SIGKILL"));

  const stuck = await survivors(lasting, Date.now() + KILL_DEADLINE_MS);

  if (stuck.length > 0) {
    failures.push(new Error(`process groups ${stuck.join(", ")} still run, so their files stay`));
  }

  throwFirstFailure(failures);
}

export async function startWorker(
  record: (group: number) => void,
  port: number,
  state: string,
  envFile: string,
  config: readonly string[],
): Promise<number> {
  const worker = spawn(
    "worker-local",
    [
      state,
      String(port),
      "--ip",
      WORKER_HOST,
      "--inspector-port",
      "0",
      "--env-file",
      envFile,
      ...config,
    ],
    { cwd: ROOT, detached: true, stdio: "ignore" },
  );
  if (worker.pid !== undefined) record(worker.pid);
  await once(worker, "spawn");
  return ProcessIdSchema.parse(worker.pid);
}
