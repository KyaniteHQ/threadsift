import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { withCleanup } from "../src/core/kernel/failure-log.ts";
import { attemptEvery } from "./attempt-every.ts";
import { exitAfterSignal } from "./exit-after-signal.ts";
import { lockRuns, type RunLock } from "./worker-build-cost-lock.ts";
import { ROOT, startWorker, stopGroups } from "./worker-build-cost-processes.ts";
import { ownerToken, START_DEADLINE_MS, waitUntilServing } from "./worker-build-cost-serving.ts";

const WORKER_FOLDER = join(ROOT, "src", "targets", "worker");
const CANDIDATE_ENTRY = "src/targets/worker/index.ts";
const FIRST_PORT = 8841;
const CLEANUP_FAILED = { event: "worker-build-cost-cleanup-failed", fields: {} } as const;

export const ROUTES = [
  { name: "GET /api/session", path: "/api/session", authorized: false },
  { name: "GET /api/items", path: "/api/items", authorized: true },
  { name: "GET /api/openapi.json", path: "/api/openapi.json", authorized: true },
  { name: "GET / (static page)", path: "/", authorized: false },
] as const;

export type Route = (typeof ROUTES)[number];

const NAMES = ["baseline", "candidate"] as const;

type Name = (typeof NAMES)[number];

export interface Variant {
  readonly name: Name;
  readonly origin: string;
  readonly token: string;
  readonly processGroup: number;
}

export type Variants = readonly [Variant, Variant];

function sourceOf(version: string): string {
  if (existsSync(version)) return readFileSync(version, "utf8");
  return execFileSync("git", ["show", `${version}:${CANDIDATE_ENTRY}`], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

interface Prepared {
  readonly setupCode: string;
  readonly envFile: string;
}

const entryFile = (name: string): string => `worker-build-cost-${name}.tmp.ts`;

const configFile = (name: string): string => `wrangler.worker-build-cost-${name}.tmp.jsonc`;

function prepare(versions: readonly [string, string], state: string): Prepared {
  remove(state);
  mkdirSync(state, { recursive: true, mode: 0o700 });
  const setupCode = randomBytes(24).toString("base64url");
  const envFile = join(state, "env");
  writeFileSync(
    envFile,
    `SETUP_CODE=${setupCode}\nTHREADSIFT_SECRET_KEY=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600 },
  );
  const wrangler = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8");
  for (const [index, name] of NAMES.entries()) {
    writeFileSync(join(WORKER_FOLDER, entryFile(name)), sourceOf(versions[index] ?? ""));
    writeFileSync(
      join(ROOT, configFile(name)),
      wrangler.replace(CANDIDATE_ENTRY, `src/targets/worker/${entryFile(name)}`),
    );
  }
  return { setupCode, envFile };
}

function remove(target: string): void {
  rmSync(target, { recursive: true, force: true });
}

function removals(state: string): (() => undefined)[] {
  const files = NAMES.flatMap((name) => [
    join(WORKER_FOLDER, entryFile(name)),
    join(ROOT, configFile(name)),
  ]);

  return [...files, state].map((target): (() => undefined) => () => {
    remove(target);
  });
}

async function tearDown(
  state: string,
  lock: Readonly<RunLock>,
  groups: readonly number[],
): Promise<void> {
  await stopGroups(groups);
  attemptEvery(removals(state));
  await lock.release();
}

type Slot = 0 | 1;

const forBoth = <Value>(make: (name: Name, slot: Slot) => Value): readonly [Value, Value] => [
  make(NAMES[0], 0),
  make(NAMES[1], 1),
];

const originOf = (slot: Slot): string => `http://127.0.0.1:${FIRST_PORT + slot}`;

async function serving(
  prepared: Readonly<Prepared>,
  groups: readonly [number, number],
): Promise<Variants> {
  const deadline = Date.now() + START_DEADLINE_MS;
  await Promise.all(forBoth((_, slot) => waitUntilServing(originOf(slot), deadline)));
  const tokens = await Promise.all(
    forBoth((_, slot) => ownerToken(originOf(slot), prepared.setupCode)),
  );
  return forBoth((name, slot) => ({
    name,
    origin: originOf(slot),
    token: tokens[slot],
    processGroup: groups[slot],
  }));
}

interface Starting {
  readonly spawned: Promise<readonly number[]>;
  readonly started: Promise<readonly [number, number]>;
}

function startWorkers(lock: Readonly<RunLock>, state: string, envFile: string): Starting {
  const pending = Promise.allSettled(
    forBoth((name, slot) =>
      startWorker(lock.record, FIRST_PORT + slot, join(state, name), envFile, [
        "--config",
        configFile(name),
      ]),
    ),
  );

  return {
    spawned: pending.then((workers) =>
      workers.flatMap((worker) => (worker.status === "fulfilled" ? [worker.value] : [])),
    ),
    started: pending.then(([baseline, candidate]): readonly [number, number] => {
      if (baseline.status === "rejected") throw baseline.reason;
      if (candidate.status === "rejected") throw candidate.reason;

      return [baseline.value, candidate.value];
    }),
  };
}

export const WORKING_TREE = CANDIDATE_ENTRY;

export async function withHarness<Result>(
  versions: readonly [string, string],
  folderName: string,
  body: (variants: Variants) => Promise<Result>,
): Promise<Result> {
  const lock = await lockRuns();
  const state = join(ROOT, ".wrangler", folderName);
  let spawned: Promise<readonly number[]> = Promise.resolve([]);
  let finished: Promise<void> | undefined;
  const cleanUp = (): Promise<void> => {
    finished ??= spawned.then((groups) => tearDown(state, lock, groups));

    return finished;
  };
  const release = exitAfterSignal(cleanUp);

  try {
    return await withCleanup(
      CLEANUP_FAILED,
      async () => {
        const prepared = prepare(versions, state);
        const workers = startWorkers(lock, state, prepared.envFile);

        spawned = workers.spawned;

        return body(await serving(prepared, await workers.started));
      },
      cleanUp,
    );
  } finally {
    release();
  }
}

export async function request(variant: Readonly<Variant>, route: Readonly<Route>): Promise<void> {
  const response = await fetch(
    `${variant.origin}${route.path}`,
    route.authorized ? { headers: { authorization: `Bearer ${variant.token}` } } : {},
  );
  await response.arrayBuffer();
  if (response.status !== 200) {
    throw new Error(`${route.name} on ${variant.name} answered ${response.status}`);
  }
}
