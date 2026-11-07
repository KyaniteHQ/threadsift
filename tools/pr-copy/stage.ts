import { createHash } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";

import { experimental_readRawConfig } from "wrangler";
import { z } from "zod";

import type { CopyNames, Stage } from "./cloudflare.ts";

const WORKER_CONFIG = "wrangler.jsonc";

const WorkerConfigSchema = z
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
    r2_buckets: z
      .tuple([z.object({ binding: z.literal("FILES"), bucket_name: z.string() }).strict()])
      .optional(),
    ai: z
      .object({ binding: z.literal("AI") })
      .strict()
      .optional(),
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

export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/u);

export const MigrationHashesSchema = z.record(z.string(), Sha256).readonly();

export type MigrationHashes = z.infer<typeof MigrationHashesSchema>;

const HIDDEN_KEY = /__proto__|\\u/u;

function readWorkerConfig(artifact: string) {
  const config = artifactFile(artifact, WORKER_CONFIG);

  if (HIDDEN_KEY.test(readFileSync(config, "utf8"))) {
    throw new Error(
      `${WORKER_CONFIG} holds __proto__ or a \\u escape, which its parser would hide`,
    );
  }

  return WorkerConfigSchema.parse(experimental_readRawConfig({ config }).rawConfig);
}

export function copyConfig(names: Readonly<CopyNames>, artifact: string) {
  const source = readWorkerConfig(artifact);

  const [database] = source.d1_databases;
  const [producer] = source.queues.producers;
  const [consumer] = source.queues.consumers;

  return {
    name: names.name,
    main: "dist/worker/index.js",
    no_bundle: true,
    workers_dev: true,
    compatibility_date: source.compatibility_date,
    compatibility_flags: source.compatibility_flags,
    assets: { ...source.assets, directory: "dist/web" },
    d1_databases: [
      { binding: database.binding, database_name: names.name, migrations_dir: "migrations" },
    ],
    r2_buckets: (source.r2_buckets ?? []).map((files) => ({
      binding: files.binding,
      bucket_name: names.bucket,
    })),
    ai: source.ai,
    queues: {
      producers: [{ binding: producer.binding, queue: names.queue }],
      consumers: [{ ...consumer, queue: names.queue }],
    },
    triggers: source.triggers,
    limits: source.limits,
    observability: {
      enabled: true,
      head_sampling_rate: 1,
      logs: { enabled: true, head_sampling_rate: 1, invocation_logs: true },
    },
  } as const;
}

function requireInside(root: string, path: string): void {
  const fromRoot = relative(root, realpathSync(path));

  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`${path} in the artifact points outside it`);
  }
}

function requireArtifactFiles(root: string, path: string): void {
  requireInside(root, path);
  const stat = lstatSync(path);

  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      requireArtifactFiles(root, join(path, entry));
    }
  } else if (!stat.isFile()) {
    throw new Error(`${path} in the artifact is not a regular file or folder`);
  }
}

function artifactFile(artifact: string, path: string): string {
  const source = join(artifact, path);
  requireArtifactFiles(realpathSync(artifact), source);

  return source;
}

function copyIn(artifact: string, dir: string, path: string): void {
  cpSync(artifactFile(artifact, path), join(dir, path), { recursive: true });
}

function migrationFiles(dir: string): string[] {
  const files = readdirSync(join(dir, "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .toSorted();

  for (const file of files) {
    if (!lstatSync(join(dir, "migrations", file)).isFile()) {
      throw new Error(`migrations/${file} is not a regular file`);
    }
  }

  return files;
}

function deployedPaths(artifact: string): string[] {
  return [
    "dist/web",
    "dist/worker/index.js",
    ...migrationFiles(artifact).map((file) => join("migrations", file)),
  ];
}

function copyArtifact(artifact: string, dir: string): void {
  for (const path of deployedPaths(artifact)) {
    copyIn(artifact, dir, path);
  }
}

function filesUnder(artifact: string, path: string): string[] {
  const source = artifactFile(artifact, path);

  if (!lstatSync(source).isDirectory()) return [path];

  return readdirSync(source, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(artifact, join(entry.parentPath, entry.name)));
}

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function artifactDigest(artifact: string): string {
  const listing = [...deployedPaths(artifact), WORKER_CONFIG]
    .flatMap((path) => filesUnder(artifact, path))
    .toSorted()
    .map((file) => `${file}\0${fileHash(join(artifact, file))}\n`);

  return createHash("sha256").update(listing.join("")).digest("hex");
}

export async function withStage<Result>(
  target: Readonly<CopyNames>,
  artifact: string | null,
  work: (stage: Readonly<Stage>) => Promise<Result>,
): Promise<Result> {
  const dir = mkdtempSync(join(tmpdir(), "threadsift-pr-copy-"));

  try {
    if (artifact !== null) {
      copyArtifact(artifact, dir);
    }

    const config = artifact === null ? { name: target.name } : copyConfig(target, artifact);
    const configPath = join(dir, "wrangler.json");
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    return await work({ dir, configPath, target });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function migrationHashes(dir: string): MigrationHashes {
  return Object.fromEntries(
    migrationFiles(dir).map((file) => [file, fileHash(join(dir, "migrations", file))]),
  );
}
