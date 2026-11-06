import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { CopyConfig, CopyNames } from "./cloudflare.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const READ_RAW_CONFIG = `import { experimental_readRawConfig } from "wrangler";
process.stdout.write(JSON.stringify(experimental_readRawConfig({ config: "wrangler.jsonc" }).rawConfig));`;

export type MigrationHashes = Readonly<Record<string, string>>;

const LiveConfigSchema = z
  .object({
    $schema: z.string(),
    name: z.string(),
    main: z.string(),
    compatibility_date: z.string(),
    compatibility_flags: z.array(z.string()),
    assets: z
      .object({
        directory: z.string(),
        binding: z.string(),
        run_worker_first: z.array(z.string()),
      })
      .strict(),
    d1_databases: z.tuple([z.object({ binding: z.string(), database_name: z.string() }).strict()]),
    queues: z
      .object({
        producers: z.tuple([z.object({ binding: z.string(), queue: z.string() }).strict()]),
        consumers: z.tuple([
          z.object({ queue: z.string(), max_batch_size: z.number().int() }).strict(),
        ]),
      })
      .strict(),
    triggers: z.object({ crons: z.array(z.string()) }).strict(),
    limits: z.object({ cpu_ms: z.number().int() }).strict(),
    alias: z.record(z.string(), z.string()),
  })
  .strict();

type LiveConfig = z.infer<typeof LiveConfigSchema>;

function liveConfig(): LiveConfig {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", READ_RAW_CONFIG], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`Reading wrangler.jsonc failed: ${result.stderr}`);
  }

  return LiveConfigSchema.parse(JSON.parse(result.stdout));
}

function databaseBinding(binding: string, names: Readonly<CopyNames>, databaseId?: string) {
  const database = { binding, database_name: names.database, migrations_dir: "migrations" };

  return databaseId === undefined ? database : { ...database, database_id: databaseId };
}

export function copyConfig(names: Readonly<CopyNames>, databaseId?: string): CopyConfig {
  const live = liveConfig();
  const [database] = live.d1_databases;
  const [producer] = live.queues.producers;
  const [consumer] = live.queues.consumers;

  return {
    name: names.worker,
    main: "dist/worker/index.js",
    no_bundle: true,
    workers_dev: true,
    compatibility_date: live.compatibility_date,
    compatibility_flags: live.compatibility_flags,
    assets: { ...live.assets, directory: "dist/web" },
    d1_databases: [databaseBinding(database.binding, names, databaseId)],
    queues: {
      producers: [{ binding: producer.binding, queue: names.queue }],
      consumers: [{ ...consumer, queue: names.queue }],
    },
    triggers: live.triggers,
    limits: live.limits,
  };
}

function refuseLinks(path: string): void {
  const stat = lstatSync(path);

  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      refuseLinks(join(path, entry));
    }
  } else if (!stat.isFile()) {
    throw new Error(`${path} in the artifact is neither a file nor a folder`);
  }
}

function copyIn(artifact: string, dir: string, path: string): void {
  const source = join(artifact, path);
  refuseLinks(source);
  cpSync(source, join(dir, path), { recursive: true });
}

function migrationFiles(dir: string): string[] {
  return readdirSync(join(dir, "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .toSorted();
}

export function emptyStage(): string {
  return mkdtempSync(join(tmpdir(), "threadsift-pr-copy-"));
}

export function stageArtifact(artifact: string): string {
  const dir = emptyStage();

  copyIn(artifact, dir, "dist/web");
  copyIn(artifact, dir, "dist/worker/index.js");
  copyIn(artifact, dir, "dist/worker/index.js.map");

  for (const file of migrationFiles(artifact)) {
    copyIn(artifact, dir, join("migrations", file));
  }

  return dir;
}

export function migrationHashes(dir: string): MigrationHashes {
  return Object.fromEntries(
    migrationFiles(dir).map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(join(dir, "migrations", file)))
        .digest("hex"),
    ]),
  );
}
