import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

export type AppTarget = "container" | "worker";

const KEPT_LOG_LINES = 400;

const STOP_WAIT_MS = 10_000;

const SIGNAL_EXIT = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;

const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

export const liveStops = new Set<() => Promise<void>>();

const signalHandlers = { installed: false };

function stopAllOn(signal: keyof typeof SIGNAL_EXIT): void {
  process.once(signal, () => {
    void Promise.allSettled([...liveStops].map((stop) => stop())).then(() => {
      process.exit(SIGNAL_EXIT[signal]);
    });
  });
}

export function installedSignalHandlers(): void {
  if (signalHandlers.installed) return;
  signalHandlers.installed = true;
  for (const signal of SIGNALS) stopAllOn(signal);
}

const BoundSchema = z.object({ port: z.number().int().positive() });

export async function freePort(): Promise<number> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = BoundSchema.safeParse(server.address());

  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  if (!address.success) throw new Error("no free local port");
  return address.data.port;
}

export type Running = {
  readonly ended: () => string | null;
  readonly lines: () => readonly string[];
  readonly stop: () => Promise<void>;
};

export type Place = { readonly folder: string; readonly port: number };

type End = { how: string | null };

function spawned(
  target: AppTarget,
  { folder, port: number }: Place,
  env: Readonly<Record<string, string>>,
) {
  const port = String(number);
  const base = { HOME: folder, ...env };

  if (target === "container")
    return spawn(process.execPath, ["src/targets/node/index.ts"], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: {
        PATH: dirname(process.execPath),
        ...base,
        HOST: "127.0.0.1",
        PORT: port,
        DATA_DIR: join(folder, "data"),
      },
    });

  return spawn(
    "worker-local",
    [
      join(folder, "state"),
      port,
      "--ip",
      "127.0.0.1",
      "--inspector-port",
      "0",
      "--env-file",
      join(folder, "worker.env"),
      "--assets",
      join(folder, "web"),
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: { PATH: process.env["PATH"] ?? "", ...base },
    },
  );
}

function signalledGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
}

function endedWithin(exited: Readonly<Promise<void>>, ms: number): Promise<boolean> {
  return Promise.race([exited.then(() => true), sleep(ms, false, { ref: false })]);
}

export function running(
  target: AppTarget,
  place: Place,
  env: Readonly<Record<string, string>>,
): Running {
  const child = spawned(target, place, env);
  const end: End = { how: null };
  const exited = new Promise<void>((resolve) => {
    child.once("exit", (code, signal) => {
      end.how = signal === null ? `exit ${String(code)}` : `signal ${signal}`;
      resolve();
    });
    child.once("error", () => {
      end.how = "spawn error";
      resolve();
    });
  });
  const kept: string[] = [];
  const keep = (chunk: string) => {
    kept.push(...chunk.split("\n").filter((line) => line.trim() !== ""));
    kept.splice(0, Math.max(0, kept.length - KEPT_LOG_LINES));
  };

  child.stdout.setEncoding("utf8").on("data", keep);
  child.stderr.setEncoding("utf8").on("data", keep);
  return {
    ended: () => end.how,
    lines: () => [...kept],
    stop: async () => {
      try {
        if (child.pid !== undefined) {
          signalledGroup(child.pid, "SIGTERM");
          if (end.how === null && !(await endedWithin(exited, STOP_WAIT_MS))) {
            signalledGroup(child.pid, "SIGKILL");
            await exited;
          }
        }
      } finally {
        await fs.rm(place.folder, { recursive: true, force: true });
      }
    },
  };
}
