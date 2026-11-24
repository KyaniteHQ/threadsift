import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { z } from "zod";

import { pause } from "../src/core/contract/pause.ts";
import { bestEffort, errnoCodeOf, reportFailure } from "../src/core/kernel/failure-log.ts";

const ROOT = resolve(import.meta.dirname, "..");
const WORKER_FOLDER = join(ROOT, "src", "targets", "worker");
const CANDIDATE_ENTRY = "src/targets/worker/index.ts";
const FIRST_PORT = 8841;
const PASSWORD = "a measurement password of fifteen or more";
const START_DEADLINE_MS = 240_000;
const START_POLL_MS = 500;
const SETTLE_MS = 1500;
const CLEANUP_FAILED = { event: "worker-build-cost-cleanup-failed", fields: {} } as const;

export const ROUTES = [
  { name: "GET /api/session", path: "/api/session", authorized: false },
  { name: "GET /api/items", path: "/api/items", authorized: true },
  { name: "GET /api/openapi.json", path: "/api/openapi.json", authorized: true },
  { name: "GET / (static page)", path: "/", authorized: false },
] as const;

export type Route = (typeof ROUTES)[number];

export interface Variant {
  readonly name: "baseline" | "candidate";
  readonly origin: string;
  readonly token: string;
  readonly processGroup: number;
}

export interface Harness {
  readonly variants: readonly [Variant, Variant];
  readonly stop: () => Promise<void>;
}

const TokenSchema = z.object({ value: z.string() });
const ProcessGroupSchema = z.number().int().positive();

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

async function startWorker(
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
  return ProcessGroupSchema.parse(worker.pid);
}

function signalGroup(group: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-group, signal);
  } catch (error) {
    if (errnoCodeOf(error) === "ESRCH") {
      process.stderr.write(`process group ${group} already ended\n`);
    } else {
      reportFailure({ event: "worker-build-cost-group-not-signalled", fields: { group } }, error);
    }
  }
}

interface Prepared {
  readonly state: string;
  readonly setupCode: string;
  readonly envFile: string;
}

const NAMES = ["baseline", "candidate"] as const;

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

function removeTemporaryFiles(state: string): void {
  for (const name of NAMES) {
    rmSync(join(WORKER_FOLDER, entryFile(name)), { force: true });
    rmSync(join(ROOT, configFile(name)), { force: true });
  }
  rmSync(state, { recursive: true, force: true });
}

async function tearDown(state: string, groups: readonly number[]): Promise<void> {
  for (const group of groups) signalGroup(group, "SIGTERM");
  await pause(SETTLE_MS);
  removeTemporaryFiles(state);
}

async function serving(
  prepared: Readonly<Prepared>,
  groups: readonly [number, number],
): Promise<Harness["variants"]> {
  const origins = [FIRST_PORT, FIRST_PORT + 1].map((port) => `http://127.0.0.1:${port}`);
  const deadline = Date.now() + START_DEADLINE_MS;
  await Promise.all(origins.map((origin) => waitUntilServing(origin, deadline)));
  const [baselineToken, candidateToken] = await Promise.all(
    origins.map((origin) => ownerToken(origin, prepared.setupCode)),
  );
  return [
    {
      name: "baseline",
      origin: `http://127.0.0.1:${FIRST_PORT}`,
      token: baselineToken ?? "",
      processGroup: groups[0],
    },
    {
      name: "candidate",
      origin: `http://127.0.0.1:${FIRST_PORT + 1}`,
      token: candidateToken ?? "",
      processGroup: groups[1],
    },
  ];
}

export const WORKING_TREE = CANDIDATE_ENTRY;

export async function startHarness(
  versions: readonly [string, string],
  folderName: string,
): Promise<Harness> {
  const state = join(ROOT, ".wrangler", folderName);
  let groups: readonly number[] = [];
  const cleanUp = (): Promise<void> => tearDown(state, groups);

  try {
    const prepared = prepare(versions, state);
    const { envFile } = prepared;

    const settled = await Promise.allSettled([
      startWorker(FIRST_PORT, join(state, "baseline"), envFile, [
        "--config",
        configFile("baseline"),
      ]),
      startWorker(FIRST_PORT + 1, join(state, "candidate"), envFile, [
        "--config",
        configFile("candidate"),
      ]),
    ]);
    const [baseline, candidate] = settled;

    groups = settled.flatMap((worker) => (worker.status === "fulfilled" ? [worker.value] : []));
    if (baseline.status === "rejected") throw baseline.reason;
    if (candidate.status === "rejected") throw candidate.reason;

    return {
      variants: await serving(prepared, [baseline.value, candidate.value]),
      stop: () => bestEffort(CLEANUP_FAILED, cleanUp),
    };
  } catch (error) {
    await bestEffort(CLEANUP_FAILED, cleanUp);
    throw error;
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

export function median(values: readonly number[]): number {
  return percentile(values, 50);
}

export function percentile(values: readonly number[], rank: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((rank / 100) * sorted.length))] ?? 0;
}

export function inSequence<T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>,
): Promise<readonly R[]> {
  return items.reduce<Promise<R[]>>(async (done, item) => {
    const results = await done;
    results.push(await run(item));
    return results;
  }, Promise.resolve([]));
}

export function counted(total: number): readonly number[] {
  return Array.from({ length: total }, (_, index) => index);
}
