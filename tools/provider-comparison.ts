import { execFileSync } from "node:child_process";
import { type FileHandle, mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { AI_DEADLINE_MS, type AiExecution, ModelDigestSchema } from "../src/core/ai-contract.ts";
import { TASKS } from "../src/core/ai-tasks.ts";
import { submittedAmong } from "../src/core/reddit-thread.ts";
import {
  type ComparisonItem,
  ComparisonError,
  type Snapshot,
  SnapshotSchema,
  capture,
  hash,
  outsideRepository,
  schemaHash,
} from "./provider-comparison-input.ts";
import {
  type PreparedProvider,
  type ProviderSpec,
  ProvidersSchema,
  prepareProvider,
} from "./provider-comparison-providers.ts";

const shutdown = new AbortController();

process.once("SIGINT", () => {
  process.exitCode = 130;
  shutdown.abort();
});
process.once("SIGTERM", () => {
  process.exitCode = 143;
  shutdown.abort();
});

async function outcome(item: Readonly<ComparisonItem>, provider: PreparedProvider) {
  if (shutdown.signal.aborted) return { kind: "unavailable", reason: "interrupted" } as const;
  if (item.kind === "unavailable") return { kind: "unavailable", reason: item.reason } as const;
  if (provider.kind === "unavailable") return provider;

  try {
    const result = await provider.run(
      {
        instructions: TASKS.digest.instructions,
        schema: TASKS.digest.schema,
        input: TASKS.digest.prepareInput(item.input),
        maxOutputTokens: item.maxOutputTokens,
      },
      AbortSignal.any([shutdown.signal, AbortSignal.timeout(AI_DEADLINE_MS)]),
    );

    return digestResult(result, item.submitted);
  } catch {
    return { kind: "unavailable", reason: "executor-failed" } as const;
  }
}

function digestResult(
  result: AiExecution<z.infer<typeof ModelDigestSchema>>,
  submitted: readonly string[],
) {
  if (result.kind !== "done") return result;
  const digest = ModelDigestSchema.parse(result.result);

  return {
    kind: "done",
    digest,
    keptComments: submittedAmong(digest.keptComments, submitted),
  } as const;
}

async function recordItems(
  records: Readonly<FileHandle>,
  items: Snapshot["items"],
  spec: Readonly<ProviderSpec>,
  provider: PreparedProvider,
  index: number,
): Promise<void> {
  const item = items[index];

  if (item === undefined) return;
  const start = performance.now();
  const result = await outcome(item, provider);
  const elapsedMs = performance.now() - start;

  await records.writeFile(
    JSON.stringify({
      index,
      selector: item.selector,
      provider: spec.id,
      model: spec.model,
      availability: provider.kind === "unavailable" ? provider.reason : "ready",
      elapsedMs,
      result,
    }) + "\n",
  );
  await records.sync();
  console.info(JSON.stringify({ provider: spec.id, index, kind: result.kind }));
  await recordItems(records, items, spec, provider, index + 1);
}

async function recordProviders(
  records: Readonly<FileHandle>,
  items: Snapshot["items"],
  specs: readonly Readonly<ProviderSpec>[],
  folder: string,
  index: number,
): Promise<void> {
  const spec = specs[index];

  if (spec === undefined) return;
  let provider: PreparedProvider;

  try {
    provider = shutdown.signal.aborted
      ? { kind: "unavailable", reason: "interrupted" }
      : await prepareProvider(spec, folder);
  } catch {
    provider = { kind: "unavailable", reason: "provider-initialization-failed" };
  }

  try {
    await recordItems(records, items, spec, provider, 0);
  } finally {
    if (provider.kind === "ready") provider.stop();
  }

  await recordProviders(records, items, specs, folder, index + 1);
}

async function run(snapshotPath: string, providersPath: string, outputRoot: string): Promise<void> {
  const root = await outsideRepository(outputRoot);
  const snapshotText = await readFile(snapshotPath, "utf8");
  const snapshot = SnapshotSchema.parse(JSON.parse(snapshotText));
  const providers = ProvidersSchema.parse(JSON.parse(await readFile(providersPath, "utf8")));

  if (snapshot.instructions !== TASKS.digest.instructions || snapshot.schemaHash !== schemaHash())
    throw new ComparisonError("Digest contract changed; capture the Item list again");
  if (new Set(providers.map(({ id }) => id)).size !== providers.length)
    throw new ComparisonError("Duplicate Provider ids");

  const folder = await mkdtemp(join(root, "comparison-"));
  const startedAt = new Date().toISOString();
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const manifest = {
    startedAt,
    revision,
    worktreeDirty:
      execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() !== "",
    snapshotHash: hash(snapshotText),
    items: snapshot.items.length,
    providers,
    deadlineMs: AI_DEADLINE_MS,
  };

  await writeFile(join(folder, "manifest.json"), JSON.stringify(manifest, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  await writeFile(join(folder, "inputs.json"), snapshotText, { flag: "wx", mode: 0o600 });
  const records = await open(join(folder, "records.jsonl"), "wx", 0o600);

  try {
    await recordProviders(records, snapshot.items, providers, folder, 0);
  } finally {
    await records.close();
  }

  console.info(JSON.stringify({ records: snapshot.items.length * providers.length, folder }));
}

async function main(): Promise<void> {
  const [command, first, second, third, ...rest] = process.argv.slice(2);

  if (first === undefined || second === undefined || third === undefined || rest.length > 0)
    throw new ComparisonError(
      "Usage: node tools/provider-comparison.ts capture <database> <items.json> <output-root> | run <inputs.json> <providers.json> <output-root>",
    );

  if (command === "capture") {
    const root = await outsideRepository(third);
    const snapshot = await capture(first, second);
    const folder = await mkdtemp(join(root, "inputs-"));

    await writeFile(join(folder, "inputs.json"), JSON.stringify(snapshot, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    console.info(JSON.stringify({ items: snapshot.items.length, folder }));

    return;
  }

  if (command !== "run") throw new ComparisonError("Unknown comparison command");

  await run(first, second, third);
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof ComparisonError
      ? error.message
      : "provider-comparison-failed: check external JSON input schemas and read access to the library database",
  );
  process.exitCode = 1;
}
