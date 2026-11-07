import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { listBuckets, removeBucket } from "./bucket.ts";
import {
  CloudflareAnswerError,
  PageSchema,
  accountRequest,
  cloudflareGet,
  listFrom,
} from "./cloudflare-api.ts";
import { requiredEnv } from "./env.ts";
import { queueInventoryRow } from "./queue-inventory.ts";

const WORKER_NOT_FOUND = 10007;

const COPY_NAME = /^threadsift-pr-(?<pr>[0-9]+)(?:-jobs|-files)?$/u;

const WRANGLER = fileURLToPath(new URL("../../node_modules/.bin/wrangler", import.meta.url));

export interface CopyNames {
  readonly name: string;
  readonly queue: string;
  readonly bucket: string;
}

export interface Stage {
  readonly dir: string;
  readonly configPath: string;
  readonly target: CopyNames;
}

export type Command =
  | {
      readonly kind: "wrangler";
      readonly subcommand: readonly string[];
      readonly names: readonly string[];
      readonly flags: readonly string[];
      readonly env: Readonly<Record<string, string>>;
    }
  | { readonly kind: "delete-worker"; readonly names: readonly [string] }
  | { readonly kind: "delete-bucket"; readonly names: readonly [string] };

export interface Inventory {
  readonly workers: readonly string[];
  readonly databases: readonly Readonly<{ name: string; uuid: string }>[];
  readonly queues: readonly Readonly<{ name: string; consumers: readonly string[] }>[];
  readonly buckets: readonly string[];
}

export const LIVE: CopyNames = {
  name: "threadsift-live",
  queue: "threadsift-live-jobs",
  bucket: "threadsift-live-files",
};

const PROTECTED_BUCKETS: ReadonlySet<string> = new Set(["threadsift-files", LIVE.bucket]);

export function copyNames(pr: number): CopyNames {
  const name = `threadsift-pr-${String(pr)}`;

  return { name, queue: `${name}-jobs`, bucket: `${name}-files` };
}

export function prOf(name: string): number {
  return Number(COPY_NAME.exec(name)?.groups?.["pr"]);
}

export function copyNumbers(found: Readonly<Inventory>): number[] {
  return [
    ...new Set(
      [
        ...found.workers,
        ...found.databases.map((row) => row.name),
        ...found.queues.map((row) => row.name),
        ...found.buckets,
      ].map((name) => prOf(name)),
    ),
  ];
}

function wranglerCommand(
  subcommand: readonly string[],
  names: readonly string[],
  flags: readonly string[] = [],
  env: Readonly<Record<string, string>> = {},
): Command {
  return { kind: "wrangler", subcommand, names, flags, env };
}

export const createQueue = (queue: string) => wranglerCommand(["queues", "create"], [queue]);

export const deleteQueue = (queue: string) => wranglerCommand(["queues", "delete"], [queue]);

export const removeConsumer = (queue: string, worker: string) =>
  wranglerCommand(["queues", "consumer", "remove"], [queue, worker]);

export const createDatabase = (name: string) => wranglerCommand(["d1", "create"], [name]);

export const deleteDatabase = (name: string) =>
  wranglerCommand(["d1", "delete"], [name], ["--skip-confirmation"]);

export const applyMigrations = (name: string) =>
  wranglerCommand(["d1", "migrations", "apply"], [name], ["--remote"]);

export const deployWorker = (secretsFile: string, outputFile: string) =>
  wranglerCommand(["deploy"], [], ["--secrets-file", secretsFile], {
    WRANGLER_OUTPUT_FILE_PATH: outputFile,
  });

const deleteNamed = (kind: "delete-worker" | "delete-bucket", name: string): Command => ({
  kind,
  names: [name],
});

export const deleteWorker = (worker: string) => deleteNamed("delete-worker", worker);

export const deleteBucket = (bucket: string) => deleteNamed("delete-bucket", bucket);

function redact(text: string): string {
  return text.replaceAll(requiredEnv("CLOUDFLARE_ACCOUNT_ID"), "<account>");
}

export function refuseOutsideTarget(target: Readonly<CopyNames>, names: readonly string[]): void {
  const kept = names.filter((name) => PROTECTED_BUCKETS.has(name));

  if (kept.length > 0) {
    throw new Error(`Refused protected bucket: ${kept.join(", ")}`);
  }

  const outside = names.filter(
    (name) => name !== target.name && name !== target.queue && name !== target.bucket,
  );

  if (outside.length > 0) {
    throw new Error(`Refused outside ${target.name}: ${outside.join(", ")}`);
  }
}

function runWrangler(
  stage: Readonly<Stage>,
  args: readonly string[],
  env: Readonly<Record<string, string>>,
): Promise<void> {
  const argv = [...args, "--config", stage.configPath];

  const child = spawn(WRANGLER, argv, {
    cwd: stage.dir,
    env: {
      PATH: process.env["PATH"],
      HOME: process.env["HOME"],
      CI: "1",
      WRANGLER_SEND_METRICS: "false",
      CLOUDFLARE_API_TOKEN: requiredEnv("CLOUDFLARE_API_TOKEN"),
      CLOUDFLARE_ACCOUNT_ID: requiredEnv("CLOUDFLARE_ACCOUNT_ID"),
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output: string[] = [`$ wrangler ${argv.join(" ")}\n`];
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    output.push(chunk);
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    output.push(chunk);
  });

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      process.stdout.write(redact(output.join("")));

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`wrangler ${args.slice(0, 2).join(" ")} exited ${String(code)}`));
      }
    });
  });
}

async function removeWorker(worker: string): Promise<void> {
  try {
    await accountRequest("DELETE", `workers/scripts/${worker}`);
  } catch (error) {
    if (
      !(
        error instanceof CloudflareAnswerError &&
        error.status === 404 &&
        error.codes.includes(WORKER_NOT_FOUND)
      )
    ) {
      throw error;
    }

    process.stdout.write(`The Worker ${worker} is gone already\n`);

    return;
  }

  process.stdout.write(`$ DELETE workers/scripts/${worker}\nDeleted the Worker ${worker}\n`);
}

export async function cloudflare(
  stage: Readonly<Stage>,
  command: Readonly<Command>,
): Promise<void> {
  refuseOutsideTarget(stage.target, command.names);

  if (command.kind === "wrangler") {
    await runWrangler(
      stage,
      [...command.subcommand, ...command.names, ...command.flags],
      command.env,
    );

    return;
  }

  if (command.kind === "delete-bucket") {
    await removeBucket(command.names[0]);

    return;
  }

  await removeWorker(command.names[0]);
}

const WorkerRow = z.object({ id: z.string() });

const DatabaseRow = z.object({ uuid: z.string(), name: z.string() });

export async function inventory(target?: Readonly<CopyNames>): Promise<Inventory> {
  const matches = (name: string) =>
    target === undefined
      ? COPY_NAME.test(name)
      : name === target.name || name === target.queue || name === target.bucket;

  const [scripts, databases, queues, buckets] = await Promise.all([
    cloudflareGet("workers/scripts", PageSchema.extend({ result: z.array(WorkerRow) })),
    listFrom("d1/database", DatabaseRow, 1),
    listFrom("queues", queueInventoryRow(matches), 1),
    listBuckets(),
  ]);

  return {
    workers: scripts.result.map((row) => row.id).filter((name) => matches(name)),
    databases: databases.filter((row) => matches(row.name)),
    queues: queues.flatMap((queue) => (queue === null ? [] : [queue])),
    buckets: buckets.filter((name) => matches(name)),
  };
}

export async function databaseId(name: string): Promise<string> {
  const databases = await listFrom(`d1/database?name=${encodeURIComponent(name)}`, DatabaseRow, 1);

  const database = databases.find((row) => row.name === name);

  if (database === undefined) {
    throw new Error(`Cloudflare lists no D1 database named ${name}`);
  }

  return database.uuid;
}

export async function workerSecretNames(stage: Readonly<Stage>, worker: string): Promise<string[]> {
  refuseOutsideTarget(stage.target, [worker]);

  const body = await cloudflareGet(
    `workers/scripts/${worker}/secrets`,
    PageSchema.extend({ result: z.array(z.object({ name: z.string() })) }),
  );

  return body.result.map((entry) => entry.name);
}
