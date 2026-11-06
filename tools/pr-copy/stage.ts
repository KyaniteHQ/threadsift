import { createHash } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { experimental_readRawConfig } from "wrangler";
import { z } from "zod";

import type { CopyNames, Stage } from "./cloudflare.ts";

const LIVE_CONFIG = fileURLToPath(new URL("../../wrangler.jsonc", import.meta.url));

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
  .strict()
  .readonly();

type LiveConfig = z.infer<typeof LiveConfigSchema>;

export const MigrationHashesSchema = z
  .record(z.string(), z.string().regex(/^[0-9a-f]{64}$/u))
  .readonly();

export type MigrationHashes = z.infer<typeof MigrationHashesSchema>;

interface StageConfig {
  readonly name: string;
  readonly d1_databases?: readonly Readonly<{ database_name: string }>[];
  readonly queues?: Readonly<{
    producers: readonly Readonly<{ queue: string }>[];
    consumers: readonly Readonly<{ queue: string }>[];
  }>;
}

let parsedLive: LiveConfig | undefined;

function liveConfig(): LiveConfig {
  parsedLive ??= LiveConfigSchema.parse(
    experimental_readRawConfig({ config: LIVE_CONFIG }).rawConfig,
  );

  return parsedLive;
}

export function copyConfig(names: Readonly<CopyNames>) {
  const live = liveConfig();
  const [database] = live.d1_databases;
  const [producer] = live.queues.producers;
  const [consumer] = live.queues.consumers;

  return {
    name: names.name,
    main: "dist/worker/index.js",
    no_bundle: true,
    workers_dev: true,
    compatibility_date: live.compatibility_date,
    compatibility_flags: live.compatibility_flags,
    assets: { ...live.assets, directory: "dist/web" },
    d1_databases: [
      { binding: database.binding, database_name: names.name, migrations_dir: "migrations" },
    ],
    queues: {
      producers: [{ binding: producer.binding, queue: names.queue }],
      consumers: [{ ...consumer, queue: names.queue }],
    },
    triggers: live.triggers,
    limits: live.limits,
  } as const;
}

export function deleteConfig(names: Readonly<CopyNames>): StageConfig {
  return { name: names.name };
}

function configNames(config: StageConfig): string[] {
  return [
    config.name,
    ...(config.d1_databases ?? []).map((database) => database.database_name),
    ...(config.queues?.producers ?? []).map((producer) => producer.queue),
    ...(config.queues?.consumers ?? []).map((consumer) => consumer.queue),
  ];
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

function copyArtifact(artifact: string, dir: string): void {
  copyIn(artifact, dir, "dist/web");
  copyIn(artifact, dir, "dist/worker/index.js");

  for (const file of migrationFiles(artifact)) {
    copyIn(artifact, dir, join("migrations", file));
  }
}

export async function withStage<Result>(
  config: StageConfig,
  artifact: string | null,
  work: (stage: Readonly<Stage>) => Promise<Result>,
): Promise<Result> {
  const dir = mkdtempSync(join(tmpdir(), "threadsift-pr-copy-"));

  try {
    if (artifact !== null) {
      copyArtifact(artifact, dir);
    }

    const configPath = join(dir, "wrangler.json");
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    return await work({ dir, configPath, names: configNames(config) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
