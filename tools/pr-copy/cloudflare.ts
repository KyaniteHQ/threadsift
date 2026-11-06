import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { requiredEnv } from "./env.ts";
import { callTimeout } from "./timeout.ts";

const COPY_NAME = /^threadsift-pr-(?<pr>[0-9]+)(?:-jobs|-files)?$/u;

const API = "https://api.cloudflare.com/client/v4";

const WRANGLER = fileURLToPath(new URL("../../node_modules/.bin/wrangler", import.meta.url));

const PER_PAGE = 100;

export interface CopyNames {
  readonly name: string;
  readonly queue: string;
}

export interface Stage {
  readonly dir: string;
  readonly configPath: string;
  readonly names: readonly string[];
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
  | { readonly kind: "delete-worker"; readonly names: readonly [string] };

export interface Inventory {
  readonly workers: readonly string[];
  readonly databases: readonly Readonly<{ name: string; uuid: string }>[];
  readonly queues: readonly Readonly<{ name: string; consumers: readonly string[] }>[];
}

export function copyNames(pr: number): CopyNames {
  const name = `threadsift-pr-${String(pr)}`;

  return { name, queue: `${name}-jobs` };
}

export function prOf(name: string): number {
  return Number(COPY_NAME.exec(name)?.groups?.["pr"]);
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

export const deleteWorker = (worker: string): Command => ({
  kind: "delete-worker",
  names: [worker],
});

function redact(text: string): string {
  return text.replaceAll(requiredEnv("CLOUDFLARE_ACCOUNT_ID"), "<account>");
}

function refuseOutsideTarget(target: Readonly<CopyNames>, names: readonly string[]): void {
  const outside = names.filter((name) => name !== target.name && name !== target.queue);

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

async function accountRequest(method: "GET" | "DELETE", path: string): Promise<Response> {
  const response = await fetch(`${API}/accounts/${requiredEnv("CLOUDFLARE_ACCOUNT_ID")}/${path}`, {
    method,
    headers: { authorization: `Bearer ${requiredEnv("CLOUDFLARE_API_TOKEN")}` },
    signal: callTimeout(),
  });

  if (!response.ok) {
    throw new Error(`Cloudflare ${method} ${path} answered ${String(response.status)}`);
  }

  return response;
}

export async function cloudflare(
  stage: Readonly<Stage>,
  command: Readonly<Command>,
): Promise<void> {
  refuseOutsideTarget(stage.target, [...stage.names, ...command.names]);

  if (command.kind === "wrangler") {
    await runWrangler(
      stage,
      [...command.subcommand, ...command.names, ...command.flags],
      command.env,
    );

    return;
  }

  const [worker] = command.names;
  await accountRequest("DELETE", `workers/scripts/${worker}`);
  process.stdout.write(`$ DELETE workers/scripts/${worker}\nDeleted the Worker ${worker}\n`);
}

const PageSchema = z.object({
  success: z.literal(true),
  result_info: z.object({ total_count: z.number().int() }).optional(),
});

async function cloudflareGet<Body>(path: string, schema: z.ZodType<Body>): Promise<Body> {
  const response = await accountRequest("GET", path);

  return schema.parse(await response.json());
}

async function listFrom<Row>(path: string, rows: z.ZodType<Row>, page: number): Promise<Row[]> {
  const separator = path.includes("?") ? "&" : "?";

  const body = await cloudflareGet(
    `${path}${separator}per_page=${String(PER_PAGE)}&page=${String(page)}`,
    PageSchema.extend({ result: z.array(rows) }),
  );

  const seen = (page - 1) * PER_PAGE + body.result.length;
  const more = body.result.length === PER_PAGE && seen < (body.result_info?.total_count ?? 0);

  return more ? [...body.result, ...(await listFrom(path, rows, page + 1))] : body.result;
}

const WorkerRow = z.object({ id: z.string() });

const DatabaseRow = z.object({ uuid: z.string(), name: z.string() });

const QueueRow = z.object({
  queue_name: z.string(),
  consumers: z.array(z.object({ script: z.string().min(1) })),
});

export async function inventory(scope: "copies" | "live" = "copies"): Promise<Inventory> {
  const matches = (name: string) =>
    scope === "copies"
      ? COPY_NAME.test(name)
      : name === "threadsift-live" || name === "threadsift-live-jobs";

  const [scripts, databases, queues] = await Promise.all([
    cloudflareGet("workers/scripts", PageSchema.extend({ result: z.array(WorkerRow) })),
    listFrom("d1/database", DatabaseRow, 1),
    listFrom("queues", QueueRow, 1),
  ]);

  return {
    workers: scripts.result.map((row) => row.id).filter((name) => matches(name)),
    databases: databases.filter((row) => matches(row.name)),
    queues: queues
      .filter((row) => matches(row.queue_name))
      .map((row) => ({
        name: row.queue_name,
        consumers: row.consumers.flatMap((consumer) => consumer.script),
      })),
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

export async function workerSecretNames(worker: string): Promise<string[]> {
  const body = await cloudflareGet(
    `workers/scripts/${worker}/secrets`,
    PageSchema.extend({ result: z.array(z.object({ name: z.string() })) }),
  );

  return body.result.map((entry) => entry.name);
}

export async function appliedMigrations(
  target: Readonly<CopyNames>,
  id: string,
): Promise<string[]> {
  refuseOutsideTarget(target, [target.name]);

  const response = await fetch(
    `${API}/accounts/${requiredEnv("CLOUDFLARE_ACCOUNT_ID")}/d1/database/${encodeURIComponent(id)}/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${requiredEnv("CLOUDFLARE_API_TOKEN")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql: "SELECT name FROM d1_migrations ORDER BY id" }),
      signal: callTimeout(),
    },
  );

  if (!response.ok)
    throw new Error(`Reading applied migrations answered ${String(response.status)}`);

  const body = z
    .object({
      success: z.literal(true),
      result: z.array(
        z.object({ success: z.literal(true), results: z.array(z.object({ name: z.string() })) }),
      ),
    })
    .parse(await response.json());

  return body.result.flatMap((result) => result.results.map((row) => row.name));
}
