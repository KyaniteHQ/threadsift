import { spawn } from "node:child_process";
import { globSync } from "node:fs";
import { mkdir, mkdtempDisposable, readFile, writeFile } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

const fields = z.enum(["tests", "passed", "failed", "cancelled", "skipped", "todo"]);
const SummarySchema = z.object({
  success: z.boolean(),
  counts: z.looseRecord(fields, z.int().nonnegative()),
  failures: z.string(),
});
type Summary = z.infer<typeof SummarySchema>;

const fileCount = globSync("test/**/*.test.{js,cjs,mjs,ts,cts,mts}").length;
const shardCount = z
  .string()
  .regex(/^[1-9]\d*$/u)
  .transform(Number)
  .pipe(z.int().max(fileCount));
const args = z.tuple([shardCount.optional()]).safeParse(process.argv.slice(2));
if (fileCount === 0) {
  process.stderr.write("No test files found.\n");
  process.exit(1);
}
if (!args.success) {
  process.stderr.write(
    `Usage: pnpm test [1..${String(fileCount)}]. For one file, run node --test test/<file>.\n`,
  );
  process.exit(2);
}
const [count = Math.min(availableParallelism(), fileCount)] = args.data;
await using directory = await mkdtempDisposable(join(tmpdir(), "threadsift-shards-"));
const junitDir = z.string().min(1).safeParse(process.env["THREADSIFT_JUNIT_DIR"]).data;
if (junitDir !== undefined) await mkdir(junitDir, { recursive: true });
const shutdown = new AbortController();
const stop = () => {
  shutdown.abort();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

function startShard(index: number, shard: string, destination: string) {
  return spawn(
    process.execPath,
    [
      "--test",
      "--test-isolation=none",
      `--test-shard=${shard}`,
      "--test-reporter=spec",
      "--test-reporter-destination=stdout",
      `--test-reporter=${new URL("./shard-reporter.ts", import.meta.url).href}`,
      `--test-reporter-destination=${destination}`,
      ...(junitDir === undefined
        ? []
        : [
            "--test-reporter=junit",
            `--test-reporter-destination=${join(junitDir, `shard-${String(index + 1)}.xml`)}`,
          ]),
      "test/",
    ],
    { stdio: ["ignore", "pipe", "pipe"], signal: shutdown.signal },
  );
}

async function runShard(index: number) {
  const shard = `${String(index + 1)}/${String(count)}`;
  const output: string[] = [];
  let summary: Summary | undefined;
  let status: string;
  let code: number | null = null;

  try {
    const destination = join(directory.path, String(index));
    const child = startShard(index, shard, destination);
    const failed = (error: Readonly<Error>) => {
      output.push(`${error.message}\n`);
      stop();
    };
    child.on("error", failed);
    for (const stream of child.pid === undefined ? [] : [child.stdout, child.stderr]) {
      stream
        .setEncoding("utf8")
        .on("data", (chunk: string) => {
          output.push(chunk);
        })
        .on("error", failed);
    }
    const closed = Promise.withResolvers<void>();
    child.once("close", closed.resolve);
    await closed.promise;
    code = child.exitCode;
    status = child.signalCode === null ? `exit ${String(code)}` : `signal ${child.signalCode}`;
    const raw = await readFile(destination, "utf8").catch(() => "");
    if (raw) summary = SummarySchema.parse(JSON.parse(raw));
  } catch (error) {
    stop();
    status = String(error);
  }

  const passed =
    code === 0 &&
    !shutdown.signal.aborted &&
    summary?.success === true &&
    summary.counts.failed === 0 &&
    summary.counts.cancelled === 0;
  const failure = passed
    ? null
    : `Shard ${shard} failed (${status})\n${summary?.failures ?? "Missing test summary"}\n`;
  if (failure !== null && junitDir !== undefined) {
    await writeFile(join(junitDir, `shard-${String(index + 1)}.txt`), failure);
  }
  process.stdout.write(`\nShard ${shard}\n${output.join("")}${failure ?? ""}`);
  return { summary, failure };
}

const started = performance.now();
const results = await Promise.all(Array.from({ length: count }, (_, index) => runShard(index)));
process.off("SIGINT", stop);
process.off("SIGTERM", stop);
for (const { failure } of results) {
  if (failure !== null) {
    process.stdout.write(failure);
    process.exitCode = 1;
  }
}
for (const field of fields.options) {
  const total = results.reduce((sum, { summary }) => sum + (summary?.counts[field] ?? 0), 0);
  const label = field === "passed" ? "pass" : field === "failed" ? "fail" : field;
  process.stdout.write(`${label} ${String(total)}\n`);
  if (field === "tests" && total === 0) {
    process.stderr.write("No completed tests reported.\n");
    process.exitCode = 1;
  }
}
process.stdout.write(`wall ${((performance.now() - started) / 1000).toFixed(2)} s\n`);
