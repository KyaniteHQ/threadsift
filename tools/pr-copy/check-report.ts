import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Run } from "./check-run.ts";
import type { ScenarioResult } from "./check-types.ts";

const SHA = /^[0-9a-f]{40}$/u;

function checkerCommit(): string {
  const named =
    process.env["GITHUB_SHA"] ??
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  return SHA.test(named) ? named : "unknown";
}

function summary(results: readonly Readonly<ScenarioResult>[]): string {
  const rows = results.map(
    (result) => `| ${result.scenario} | ${result.verdict} | ${result.note} |`,
  );

  const values = results.flatMap((result) =>
    result.measures.map(
      (measure) => `| ${result.scenario} | ${measure.name} | ${String(measure.value)} |`,
    ),
  );

  return [
    "| Check | Verdict | Note |",
    "|---|---|---|",
    ...rows,
    "",
    "| Check | Measured | Value |",
    "|---|---|---|",
    ...values,
    "",
  ].join("\n");
}

export function writeReport(
  out: string,
  run: Readonly<Run>,
  results: readonly Readonly<ScenarioResult>[],
): void {
  mkdirSync(out, { recursive: true });

  const manifest = {
    rerun: `gh workflow run copy-checks.yml -f pr=${String(run.pr)} -f head=${run.head}`,
    checkerCommit: checkerCommit(),
    pullRequest: run.pr,
    head: run.head,
    scriptVersion: run.version,
    scenarios: results.map((result) => ({ ...result, invocations: result.invocations.length })),
  };

  const invocations = results.flatMap((result) =>
    result.invocations.map((entry) => ({ scenario: result.scenario, ...entry })),
  );

  writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(out, "invocations.json"), `${JSON.stringify(invocations, null, 2)}\n`);

  const text = summary(results);
  process.stdout.write(`${text}\n`);

  const target = process.env["GITHUB_STEP_SUMMARY"];

  if (target !== undefined) appendFileSync(target, `${text}\n`);
}
