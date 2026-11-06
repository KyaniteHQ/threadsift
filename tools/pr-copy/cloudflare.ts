import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { requiredEnv } from "./env.ts";

const COPY_NAME = /^threadsift-pr-(?<pr>[0-9]+)(?:-jobs|-files)?$/u;

const API = "https://api.cloudflare.com/client/v4";

const WRANGLER = fileURLToPath(new URL("../../node_modules/.bin/wrangler", import.meta.url));

export interface CopyNames {
  readonly worker: string;
  readonly database: string;
  readonly queue: string;
}

export interface CopyConfig {
  readonly name: string;
  readonly main: string;
  readonly no_bundle: true;
  readonly workers_dev: true;
  readonly compatibility_date: string;
  readonly compatibility_flags: readonly string[];
  readonly assets: Readonly<{
    directory: string;
    binding: string;
    run_worker_first: readonly string[];
  }>;
  readonly d1_databases: readonly Readonly<{
    binding: string;
    database_name: string;
    database_id?: string;
    migrations_dir?: string;
  }>[];
  readonly queues: Readonly<{
    producers: readonly Readonly<{ binding: string; queue: string }>[];
    consumers: readonly Readonly<{ queue: string; max_batch_size: number }>[];
  }>;
  readonly triggers: Readonly<{ crons: readonly string[] }>;
  readonly limits: Readonly<{ cpu_ms: number }>;
}

export interface Stage {
  readonly dir: string;
  readonly config: CopyConfig;
}

export type CopyCommand =
  | { readonly kind: "create-queue" | "delete-queue"; readonly queue: string }
  | { readonly kind: "create-database" | "delete-database"; readonly database: string }
  | { readonly kind: "delete-worker"; readonly worker: string }
  | { readonly kind: "remove-consumer"; readonly queue: string; readonly worker: string }
  | { readonly kind: "apply-migrations"; readonly database: string }
  | { readonly kind: "deploy"; readonly secretsFile: string };

export interface Inventory {
  readonly workers: readonly string[];
  readonly databases: readonly Readonly<{ name: string; uuid: string }>[];
  readonly queues: readonly Readonly<{ name: string; consumers: readonly string[] }>[];
  readonly prs: readonly number[];
}

export function copyNames(pr: number): CopyNames {
  const worker = `threadsift-pr-${String(pr)}`;

  return { worker, database: worker, queue: `${worker}-jobs` };
}

function redact(text: string): string {
  return text.replaceAll(requiredEnv("CLOUDFLARE_ACCOUNT_ID"), "<account>");
}

function commandNames(command: Readonly<CopyCommand>): string[] {
  switch (command.kind) {
    case "create-queue":
    case "delete-queue":
      return [command.queue];
    case "create-database":
    case "delete-database":
    case "apply-migrations":
      return [command.database];
    case "delete-worker":
      return [command.worker];
    case "remove-consumer":
      return [command.queue, command.worker];
    case "deploy":
      return [];
    default: {
      const exhaustive: never = command;

      return exhaustive;
    }
  }
}

function configNames(config: Readonly<CopyConfig>): string[] {
  return [
    config.name,
    ...config.d1_databases.map((database) => database.database_name),
    ...config.queues.producers.map((producer) => producer.queue),
    ...config.queues.consumers.map((consumer) => consumer.queue),
  ];
}

function refuseOutsideCopies(names: readonly string[]): void {
  const outside = names.filter((name) => !COPY_NAME.test(name));

  if (outside.length > 0) {
    throw new Error(`Refused, not a pull request copy name: ${outside.join(", ")}`);
  }
}

type WranglerCommand = Exclude<CopyCommand, { readonly kind: "delete-worker" }>;

function wranglerArgs(command: Readonly<WranglerCommand>, configPath: string): string[] {
  const config = ["--config", configPath];

  switch (command.kind) {
    case "create-queue":
      return ["queues", "create", command.queue, ...config];
    case "delete-queue":
      return ["queues", "delete", command.queue, ...config];
    case "create-database":
      return ["d1", "create", command.database, ...config];
    case "delete-database":
      return ["d1", "delete", command.database, "--skip-confirmation", ...config];
    case "apply-migrations":
      return ["d1", "migrations", "apply", command.database, "--remote", ...config];
    case "remove-consumer":
      return ["queues", "consumer", "remove", command.queue, command.worker, ...config];
    case "deploy":
      return ["deploy", "--secrets-file", command.secretsFile, ...config];
    default: {
      const exhaustive: never = command;

      return exhaustive;
    }
  }
}

function childEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env["PATH"],
    HOME: process.env["HOME"],
    CI: "1",
    WRANGLER_SEND_METRICS: "false",
    CLOUDFLARE_API_TOKEN: requiredEnv("CLOUDFLARE_API_TOKEN"),
    CLOUDFLARE_ACCOUNT_ID: requiredEnv("CLOUDFLARE_ACCOUNT_ID"),
  };
}

function runWrangler(stage: Readonly<Stage>, command: Readonly<WranglerCommand>): void {
  const configPath = join(stage.dir, "wrangler.json");
  writeFileSync(configPath, `${JSON.stringify(stage.config, null, 2)}\n`);

  const args = wranglerArgs(command, configPath);
  process.stdout.write(`$ wrangler ${args.join(" ")}\n`);

  const result = spawnSync(WRANGLER, args, {
    cwd: stage.dir,
    env: childEnv(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  process.stdout.write(redact(`${result.stdout}${result.stderr}`));

  if (result.status !== 0) {
    throw new Error(`wrangler ${args.slice(0, 2).join(" ")} exited ${String(result.status)}`);
  }
}

async function accountRequest(method: "GET" | "DELETE", path: string): Promise<Response> {
  const response = await fetch(`${API}/accounts/${requiredEnv("CLOUDFLARE_ACCOUNT_ID")}/${path}`, {
    method,
    headers: { authorization: `Bearer ${requiredEnv("CLOUDFLARE_API_TOKEN")}` },
  });

  if (!response.ok) {
    throw new Error(`Cloudflare ${method} ${path} answered ${String(response.status)}`);
  }

  return response;
}

export async function cloudflare(
  stage: Readonly<Stage>,
  command: Readonly<CopyCommand>,
): Promise<void> {
  refuseOutsideCopies([...configNames(stage.config), ...commandNames(command)]);

  if (command.kind !== "delete-worker") {
    runWrangler(stage, command);

    return;
  }

  process.stdout.write(`$ DELETE workers/scripts/${command.worker}\n`);
  await accountRequest("DELETE", `workers/scripts/${command.worker}`);
  process.stdout.write(`Deleted the Worker ${command.worker}\n`);
}

const PER_PAGE = 100;

const PageSchema = z.object({
  success: z.literal(true),
  result_info: z.object({ total_count: z.number().int() }).optional(),
});

async function cloudflareGet<Body>(path: string, schema: z.ZodType<Body>): Promise<Body> {
  const response = await accountRequest("GET", path);

  return schema.parse(await response.json());
}

async function listFrom<Row>(path: string, rows: z.ZodType<Row>, page: number): Promise<Row[]> {
  const body = await cloudflareGet(
    `${path}?per_page=${String(PER_PAGE)}&page=${String(page)}`,
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
  consumers: z.array(z.object({ script: z.string().nullable().optional() })),
});

function prsOf(names: readonly string[]): number[] {
  const prs = names.map((name) => Number(COPY_NAME.exec(name)?.groups?.["pr"]));

  return [...new Set(prs)].toSorted((left, right) => left - right);
}

export async function inventory(): Promise<Inventory> {
  const [scripts, databases, queues] = await Promise.all([
    cloudflareGet("workers/scripts", PageSchema.extend({ result: z.array(WorkerRow) })),
    listFrom("d1/database", DatabaseRow, 1),
    listFrom("queues", QueueRow, 1),
  ]);

  const copies = {
    workers: scripts.result.map((row) => row.id).filter((name) => COPY_NAME.test(name)),
    databases: databases.filter((row) => COPY_NAME.test(row.name)),
    queues: queues
      .filter((row) => COPY_NAME.test(row.queue_name))
      .map((row) => ({
        name: row.queue_name,
        consumers: row.consumers.flatMap((consumer) => consumer.script ?? []),
      })),
  };

  return {
    ...copies,
    prs: prsOf([
      ...copies.workers,
      ...copies.databases.map((row) => row.name),
      ...copies.queues.map((row) => row.name),
    ]),
  };
}

export async function workersSubdomain(): Promise<string> {
  const body = await cloudflareGet(
    "workers/subdomain",
    z.object({ result: z.object({ subdomain: z.string() }) }),
  );

  return body.result.subdomain;
}
