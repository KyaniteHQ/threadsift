import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { pause } from "../src/core/contract/pause.ts";
import { withCleanup } from "../src/core/kernel/failure-log.ts";
import { attemptEvery } from "./attempt-every.ts";
import { exitAfterSignal } from "./exit-after-signal.ts";
import { lockRuns, ROOT, startWorker, stopGroups } from "./worker-build-cost-processes.ts";

const WORKER_FOLDER = join(ROOT, "src", "targets", "worker");
const CANDIDATE_ENTRY = "src/targets/worker/index.ts";
const FIRST_PORT = 8841;
const PASSWORD = "a measurement password of fifteen or more";
const START_DEADLINE_MS = 240_000;
const START_POLL_MS = 500;
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

const TokenSchema = z.object({ value: z.string() });

function sourceOf(version: string): string {
  if (existsSync(version)) return readFileSync(version, "utf8");
  return execFileSync("git", ["show", `${version}:${CANDIDATE_ENTRY}`], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

async function answers(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/api/session`);
    await response.arrayBuffer();
    return response.status === 200;
  } catch {
    return false;
  }
}

async function waitUntilServing(origin: string, deadline: number): Promise<void> {
  if (await answers(origin)) return;
  if (Date.now() > deadline) {
    throw new Error(`${origin} did not answer GET /api/session within ${START_DEADLINE_MS} ms`);
  }
  await pause(START_POLL_MS);
  await waitUntilServing(origin, deadline);
}

async function ownerToken(origin: string, setupCode: string): Promise<string> {
  const headers = { "content-type": "application/json", origin };
  const setup = await fetch(`${origin}/api/setup`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code: setupCode, password: PASSWORD }),
  });
  if (setup.status !== 204) throw new Error(`POST /api/setup answered ${setup.status}`);
  const cookie = setup.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
  const created = await fetch(`${origin}/api/tokens`, {
    method: "POST",
    headers: { ...headers, cookie },
    body: JSON.stringify({ name: "worker-build-cost" }),
  });
  if (created.status !== 201) throw new Error(`POST /api/tokens answered ${created.status}`);
  return TokenSchema.parse(await created.json()).value;
}

interface Prepared {
  readonly state: string;
  readonly setupCode: string;
  readonly envFile: string;
}

const entryFile = (name: string): string => `worker-build-cost-${name}.tmp.ts`;

const configFile = (name: string): string => `wrangler.worker-build-cost-${name}.tmp.jsonc`;

function prepare(versions: readonly [string, string], state: string): Prepared {
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
  return { state, setupCode, envFile };
}

function removals(state: string): (() => void)[] {
  const files = NAMES.flatMap((name) => [
    join(WORKER_FOLDER, entryFile(name)),
    join(ROOT, configFile(name)),
  ]);

  return [
    ...files.map((file) => () => {
      rmSync(file, { force: true });
    }),
    () => {
      rmSync(state, { recursive: true, force: true });
    },
  ];
}

async function tearDown(state: string, groups: readonly number[]): Promise<void> {
  await stopGroups(groups);
  attemptEvery(removals(state));
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

function startWorkers(state: string, envFile: string): Starting {
  const pending = Promise.allSettled(
    forBoth((name, slot) =>
      startWorker(FIRST_PORT + slot, join(state, name), envFile, ["--config", configFile(name)]),
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
  const unlock = lockRuns();
  const state = join(ROOT, ".wrangler", folderName);
  let spawned: Promise<readonly number[]> = Promise.resolve([]);
  let finished: Promise<void> | undefined;
  const cleanUp = (): Promise<void> => {
    finished ??= spawned.then((groups) => tearDown(state, groups)).finally(unlock);

    return finished;
  };
  const release = exitAfterSignal(cleanUp);

  try {
    return await withCleanup(
      CLEANUP_FAILED,
      async () => {
        const prepared = prepare(versions, state);
        const workers = startWorkers(state, prepared.envFile);

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
