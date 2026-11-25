import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { z } from "zod";

import { pause } from "../src/core/contract/pause.ts";
import { errnoCodeOf } from "../src/core/kernel/failure-log.ts";
import { signalGroup } from "../src/targets/node/cli-process.ts";

const STOP_DEADLINE_MS = 10_000;
const KILL_DEADLINE_MS = 2000;
const STOP_POLL_MS = 100;
const ProcessIdSchema = z.number().int().positive();
export const ROOT = resolve(import.meta.dirname, "..");
const RUN_LOCK = join(ROOT, ".wrangler", "worker-build-cost.lock");

function running(target: number): boolean {
  try {
    process.kill(target, 0);

    return true;
  } catch (error) {
    if (errnoCodeOf(error) === "ESRCH") return false;
    if (errnoCodeOf(error) === "EPERM") return true;

    throw error;
  }
}

export function lockRuns(): () => void {
  mkdirSync(dirname(RUN_LOCK), { recursive: true });
  try {
    writeFileSync(RUN_LOCK, String(process.pid), { flag: "wx" });
  } catch (error) {
    if (errnoCodeOf(error) !== "EEXIST") throw error;

    const holder = ProcessIdSchema.parse(Number(readFileSync(RUN_LOCK, "utf8")));

    if (running(holder)) {
      throw new Error(`another Worker build cost run, process ${holder}, holds ${RUN_LOCK}`, {
        cause: error,
      });
    }
    rmSync(RUN_LOCK);
    writeFileSync(RUN_LOCK, String(process.pid), { flag: "wx" });
  }

  return () => {
    rmSync(RUN_LOCK, { force: true });
  };
}

function signalGroups(groups: readonly number[], signal: "SIGTERM" | "SIGKILL"): void {
  for (const group of groups) signalGroup(group, signal);
}

async function survivors(groups: readonly number[], deadline: number): Promise<number[]> {
  const alive = groups.filter((group) => running(-group));

  if (alive.length === 0 || Date.now() > deadline) return alive;
  await pause(STOP_POLL_MS);

  return survivors(alive, deadline);
}

export async function stopGroups(groups: readonly number[]): Promise<void> {
  signalGroups(groups, "SIGTERM");

  const lasting = await survivors(groups, Date.now() + STOP_DEADLINE_MS);

  signalGroups(lasting, "SIGKILL");

  const stuck = await survivors(lasting, Date.now() + KILL_DEADLINE_MS);

  if (stuck.length > 0) {
    throw new Error(`process groups ${stuck.join(", ")} still run, so their files stay`);
  }
}

export async function startWorker(
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
      "127.0.0.1",
      "--inspector-port",
      "0",
      "--env-file",
      envFile,
      ...config,
    ],
    { cwd: ROOT, detached: true, stdio: "ignore" },
  );
  await once(worker, "spawn");
  return ProcessIdSchema.parse(worker.pid);
}
