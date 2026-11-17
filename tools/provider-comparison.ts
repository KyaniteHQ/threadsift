import { execFileSync } from "node:child_process";
import { type FileHandle, mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { AI_DEADLINE_MS } from "../src/core/ai-contract.ts";
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

const PRIVATE_OUTPUT = { flag: "wx", mode: 0o600 } as const;

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
        config: provider.config,
        instructions: TASKS.digest.instructions,
        schema: TASKS.digest.schema,
        input: TASKS.digest.prepareInput(item.input),
        maxOutputTokens: item.maxOutputTokens,
      },
      AbortSignal.any([shutdown.signal, AbortSignal.timeout(AI_DEADLINE_MS)]),
    );

    if (result.kind !== "done") return result;

    return {
      kind: "done",
      digest: result.result,
      keptComments: submittedAmong(result.result.keptComments, item.submitted),
    } as const;
  } catch {
    return { kind: "unavailable", reason: "executor-failed" } as const;
  }
}

async function recordItem(
  records: Readonly<FileHandle>,
  item: Readonly<ComparisonItem>,
  spec: Readonly<ProviderSpec>,
  provider: PreparedProvider,
  index: number,
): Promise<void> {
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
}

async function recordProvider(
  records: Readonly<FileHandle>,
  items: Snapshot["items"],
  spec: Readonly<ProviderSpec>,
  folder: string,
): Promise<void> {
  let provider: PreparedProvider;

  try {
    provider = shutdown.signal.aborted
      ? { kind: "unavailable", reason: "interrupted" }
      : await prepareProvider(spec, folder);
  } catch {
    provider = { kind: "unavailable", reason: "provider-initialization-failed" };
  }

  try {
    for (const [index, item] of items.entries()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Provider calls share the owner's subscription and run serially.
      await recordItem(records, item, spec, provider, index);
    }
  } finally {
    if (provider.kind === "ready") provider.stop();
  }
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

  await Promise.all([
    writeFile(join(folder, "manifest.json"), JSON.stringify(manifest, null, 2), PRIVATE_OUTPUT),
    writeFile(join(folder, "inputs.json"), snapshotText, PRIVATE_OUTPUT),
  ]);
  const records = await open(
    join(folder, "records.jsonl"),
    PRIVATE_OUTPUT.flag,
    PRIVATE_OUTPUT.mode,
  );

  try {
    for (const spec of providers) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each Provider finishes before the next subscription starts.
      await recordProvider(records, snapshot.items, spec, folder);
    }
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

    await writeFile(join(folder, "inputs.json"), JSON.stringify(snapshot, null, 2), PRIVATE_OUTPUT);
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
