import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

const REPORTER = join(import.meta.dirname, "..", "tools", "shard-reporter.ts");

const SummarySchema = z.object({
  success: z.boolean(),
  counts: z.object({
    tests: z.number(),
    passed: z.number(),
    failed: z.number(),
    cancelled: z.number(),
    skipped: z.number(),
    todo: z.number(),
  }),
  failures: z.string(),
});

const PASSING = `import { it } from "node:test";

it("passes", () => {});
it("is skipped", { skip: true }, () => {});
`;

const FAILING = `import { it } from "node:test";

it("passes", () => {});
it("fails with a message", () => {
  throw new Error("boom");
});
it("is a todo that fails", { todo: true }, () => {
  throw new Error("todo boom");
});
`;

const ALSO_FAILING = `import { it } from "node:test";

it("also fails", () => {
  throw new Error("second boom");
});
`;

describe("the shard reporter writes one summary of a shard, with each failed test and its error", () => {
  let folder = "";

  const run = (...files: readonly string[]) => {
    const answer = spawnSync(
      process.execPath,
      [
        "--test",
        "--test-isolation=none",
        `--test-reporter=${REPORTER}`,
        "--test-reporter-destination=stdout",
        ...files,
      ],
      { cwd: folder, encoding: "utf8", env: {} },
    );

    return { status: answer.status, summary: SummarySchema.parse(JSON.parse(answer.stdout)) };
  };

  before(() => {
    folder = mkdtempSync(join(tmpdir(), "threadsift-shard-reporter-"));
    writeFileSync(join(folder, "passing.test.mjs"), PASSING);
    writeFileSync(join(folder, "failing.test.mjs"), FAILING);
    writeFileSync(join(folder, "also-failing.test.mjs"), ALSO_FAILING);
  });

  after(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it("reports success and no failure text for a shard whose tests pass or are skipped", () => {
    const { status, summary } = run("passing.test.mjs");

    assert.equal(status, 0);
    assert.equal(summary.success, true);
    assert.equal(summary.failures, "");
    assert.deepEqual(summary.counts, {
      tests: 2,
      passed: 1,
      failed: 0,
      cancelled: 0,
      skipped: 1,
      todo: 0,
    });
  });

  it("names a failed test by file, line and name, and gives its error", () => {
    const { status, summary } = run("failing.test.mjs");

    assert.notEqual(status, 0);
    assert.equal(summary.success, false);
    assert.equal(summary.counts.failed, 1);
    assert.ok(
      summary.failures.startsWith(
        `${join(folder, "failing.test.mjs")}:4 fails with a message\nError: boom\n`,
      ),
    );
  });

  it("does not report a todo test that fails, and counts it as a todo", () => {
    const { summary } = run("failing.test.mjs");

    assert.equal(summary.counts.todo, 1);
    assert.equal(summary.failures.includes("todo boom"), false);
    assert.equal(summary.failures.includes("is a todo that fails"), false);
  });

  it("gathers the failures of every file of the shard in one summary", () => {
    const { summary } = run("failing.test.mjs", "also-failing.test.mjs", "passing.test.mjs");

    assert.equal(summary.counts.failed, 2);
    assert.equal(summary.counts.passed, 2);
    assert.match(summary.failures, /failing\.test\.mjs:4 fails with a message\nError: boom/u);
    assert.match(summary.failures, /also-failing\.test\.mjs:3 also fails\nError: second boom/u);
  });
});
