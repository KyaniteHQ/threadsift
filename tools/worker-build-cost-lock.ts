import { once } from "node:events";
import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { errnoCodeOf } from "../src/core/kernel/failure-log.ts";
import { ProcessIdSchema, running, WORKER_HOST } from "./worker-build-cost-processes.ts";

const RUN_LOCK_ADDRESS = "\0threadsift-worker-build-cost";
const RECORDED_GROUPS = join(tmpdir(), `threadsift-worker-build-cost-${userInfo().uid}.groups`);

export interface RunLock {
  readonly record: (group: number) => void;
  readonly release: () => Promise<void>;
}

async function closed(server: Readonly<Server>): Promise<void> {
  const ended = once(server, "close");

  server.close();
  await ended;
}

async function listening(): Promise<Server> {
  const server = createServer().unref();

  try {
    await once(server.listen(RUN_LOCK_ADDRESS), "listening");
  } catch (error) {
    if (errnoCodeOf(error) !== "EADDRINUSE") throw error;

    throw new Error("another Worker build cost run holds the run lock", { cause: error });
  }

  return server;
}

function recordedGroups(): readonly number[] {
  try {
    const lines = readFileSync(RECORDED_GROUPS, "utf8").split("\n").filter(Boolean);

    return z.array(ProcessIdSchema).parse(lines.map(Number));
  } catch (error) {
    if (errnoCodeOf(error) === "ENOENT") return [];

    throw error;
  }
}

async function inUse(port: number): Promise<boolean> {
  const probe = createServer();

  try {
    await once(probe.listen(port, WORKER_HOST), "listening");
  } catch (error) {
    if (errnoCodeOf(error) === "EADDRINUSE") return true;

    throw error;
  }
  await closed(probe);

  return false;
}

async function blockerOf(ports: readonly number[]): Promise<string | null> {
  const earlier = recordedGroups().filter((group) => running(-group));

  if (earlier.length > 0) {
    return `process groups ${earlier.join(", ")} of an earlier Worker build cost run still run; stop them first, or delete ${RECORDED_GROUPS} when those ids belong to other processes`;
  }

  const busy = (
    await Promise.all(ports.map(async (port) => ((await inUse(port)) ? [port] : [])))
  ).flat();

  return busy.length === 0
    ? null
    : `port ${busy.join(", ")} is in use by another process, so a Worker cannot start there`;
}

export async function lockRuns(ports: readonly number[]): Promise<RunLock> {
  const server = await listening();
  const blocker = await blockerOf(ports);

  if (blocker !== null) {
    await closed(server);

    throw new Error(blocker);
  }

  rmSync(RECORDED_GROUPS, { force: true });

  return {
    record: (group) => {
      appendFileSync(RECORDED_GROUPS, `${group}\n`);
    },
    release: async () => {
      rmSync(RECORDED_GROUPS, { force: true });
      await closed(server);
    },
  };
}
