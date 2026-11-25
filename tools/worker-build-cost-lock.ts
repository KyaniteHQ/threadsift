import { once } from "node:events";
import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { errnoCodeOf } from "../src/core/kernel/failure-log.ts";
import { ProcessIdSchema, running } from "./worker-build-cost-processes.ts";

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

export async function lockRuns(): Promise<RunLock> {
  const server = await listening();
  const earlier = recordedGroups().filter((group) => running(-group));

  if (earlier.length > 0) {
    await closed(server);

    throw new Error(
      `process groups ${earlier.join(", ")} of an earlier Worker build cost run still run; stop them first, or delete ${RECORDED_GROUPS} when those ids belong to other processes`,
    );
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
