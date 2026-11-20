import { createHash } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { AI_DEADLINE_MS } from "../src/core/ai-contract.ts";
import { DIGEST_TASK } from "../src/core/digest-task.ts";
import { withCleanup } from "../src/core/failure-log.ts";
import { submittedAmong } from "../src/core/thread-selection.ts";
import {
  type ComparisonItem,
  type Snapshot,
  SnapshotSchema,
  capture,
} from "./provider-comparison-input.ts";
import {
  type PreparedProvider,
  type ProviderSpec,
  ProvidersSchema,
  prepareProvider,
} from "./provider-comparison-providers.ts";
import { compatibleSource } from "./provider-comparison-source.ts";

class ComparisonError extends Error {}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function outsideRepository(folder: string): Promise<string> {
  let parent = resolve(folder);

  while (!existsSync(parent)) parent = dirname(parent);
  parent = await fs.realpath(parent);
  const canonical = existsSync(folder) ? await fs.realpath(folder) : resolve(folder);

  for (;;) {
    if (existsSync(join(parent, ".git")))
      throw new ComparisonError("Output must be outside every git checkout");
    const next = dirname(parent);

    if (next === parent) return canonical;
    parent = next;
  }
}

async function checkedProvider(
  spec: Readonly<ProviderSpec>,
  folder: string,
): Promise<PreparedProvider> {
  const home =
    spec.provider === "codex"
      ? process.env["CODEX_HOME"]
      : spec.provider === "claude-code"
        ? process.env["CLAUDE_CONFIG_DIR"]
        : undefined;

  if (home !== undefined && home.trim() !== "") {
    try {
      await outsideRepository(home);
    } catch (error) {
      if (error instanceof ComparisonError)
        return { kind: "unavailable", reason: "cli-home-inside-checkout" };
      throw error;
    }
  }

  return prepareProvider(spec, folder);
}

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
        instructions: DIGEST_TASK.instructions,
        schema: DIGEST_TASK.schema,
        input: item.input,
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
      effort: "effort" in spec ? spec.effort : undefined,
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
      : await checkedProvider(spec, folder);
  } catch {
    provider = { kind: "unavailable", reason: "provider-initialization-failed" };
  }

  await withCleanup(
    { event: "comparison-provider-not-stopped", fields: {} },
    async () => {
      for (const [index, item] of items.entries()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Calls run one at a time so their times do not affect one another.
        await recordItem(records, item, spec, provider, index);
      }
    },
    () => {
      if (provider.kind === "ready") provider.stop();
      return Promise.resolve();
    },
  );
}

async function run(snapshotPath: string, providersPath: string, outputRoot: string): Promise<void> {
  const root = await outsideRepository(outputRoot);
  const snapshotText = await fs.readFile(snapshotPath, "utf8");
  const snapshot = SnapshotSchema.parse(JSON.parse(snapshotText));
  const providers = ProvidersSchema.parse(JSON.parse(await fs.readFile(providersPath, "utf8")));

  const source = compatibleSource(snapshot);

  if ("error" in source) throw new ComparisonError(source.error);
  if (new Set(providers.map(({ id }) => id)).size !== providers.length)
    throw new ComparisonError("Duplicate Provider ids");

  const folder = await fs.mkdtemp(join(root, "comparison-"));
  const startedAt = new Date().toISOString();
  const manifest = {
    startedAt,
    revision: source.revision,
    captureRevision: snapshot.captureRevision,
    worktreeDirty: source.worktreeDirty,
    snapshotHash: hash(snapshotText),
    items: snapshot.items.length,
    providers,
    deadlineMs: AI_DEADLINE_MS,
  };

  await Promise.all([
    fs.writeFile(join(folder, "manifest.json"), JSON.stringify(manifest, null, 2), PRIVATE_OUTPUT),
    fs.writeFile(join(folder, "inputs.json"), snapshotText, PRIVATE_OUTPUT),
  ]);
  const records = await fs.open(
    join(folder, "records.jsonl"),
    PRIVATE_OUTPUT.flag,
    PRIVATE_OUTPUT.mode,
  );

  await withCleanup(
    { event: "comparison-records-not-closed", fields: {} },
    async () => {
      for (const spec of providers) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Calls run one at a time so their times do not affect one another.
        await recordProvider(records, snapshot.items, spec, folder);
      }
    },
    () => records.close(),
  );

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

    if ("error" in snapshot) throw new ComparisonError(snapshot.error);
    const folder = await fs.mkdtemp(join(root, "inputs-"));

    await fs.writeFile(
      join(folder, "inputs.json"),
      JSON.stringify(snapshot, null, 2),
      PRIVATE_OUTPUT,
    );
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
