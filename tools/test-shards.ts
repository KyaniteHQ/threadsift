import { spawn } from "node:child_process";
import { once } from "node:events";
import { availableParallelism } from "node:os";
import { text } from "node:stream/consumers";

import { z } from "zod";

const args = z
  .tuple([z.coerce.number().int().positive().optional()])
  .safeParse(process.argv.slice(2));
if (!args.success) {
  process.stderr.write(
    "Usage: pnpm test [shard-count]. For one file, run node --test test/<file>.\n",
  );
  process.exit(2);
}

const [count = availableParallelism()] = args.data;
const totals = { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
const SummarySchema = z.record(
  z.enum(["tests", "pass", "fail", "cancelled", "skipped", "todo"]),
  z.coerce.number().int().nonnegative(),
);
const started = performance.now();

async function runShard(index: number) {
  const shard = `${String(index + 1)}/${String(count)}`;
  const child = spawn(process.execPath, [
    "--test",
    "--test-isolation=none",
    `--test-shard=${shard}`,
    "--test-reporter=tap",
    "test/",
  ]);

  const [, stdout, stderr] = await Promise.all([
    once(child, "close"),
    text(child.stdout),
    text(child.stderr),
  ]);
  const footer = stdout.slice(stdout.lastIndexOf("\n1.."));
  const summary = SummarySchema.safeParse(
    Object.fromEntries(
      Array.from(
        footer.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gmu),
        ([, name, value]) => [name, value],
      ),
    ),
  );
  if (summary.success) {
    for (const field of SummarySchema.keyType.options) totals[field] += summary.data[field];
  }

  const output = `\nShard ${shard}\n${stdout}${stderr}\n`;
  if (child.exitCode === 0 && summary.success) {
    process.stdout.write(output);
    return "";
  }

  const status =
    child.signalCode === null ? `exit ${String(child.exitCode)}` : `signal ${child.signalCode}`;
  const message = `Shard ${shard} failed (${status})${summary.success ? "" : ", missing totals"}\n`;
  process.stderr.write(message);
  process.exitCode = 1;
  return output + message;
}

const failures = await Promise.all(Array.from({ length: count }, (_, index) => runShard(index)));
process.stdout.write(failures.join(""));
for (const [label, value] of Object.entries(totals))
  process.stdout.write(`${label} ${String(value)}\n`);
process.stdout.write(`wall ${((performance.now() - started) / 1000).toFixed(2)} s\n`);
