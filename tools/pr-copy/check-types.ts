import { z } from "zod";

import { CopyAnswerError } from "./copy-client.ts";
import type { Invocation } from "./telemetry.ts";

export const SCENARIO_NAMES = ["login", "queue", "cron", "cpu", "cap", "unreachable"] as const;

export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export type Verdict = "pass" | "fail" | "inconclusive";

export interface Assertion {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface Measure {
  readonly name: string;
  readonly value: number;
}

export interface ScenarioResult {
  readonly scenario: ScenarioName;
  readonly verdict: Verdict;
  readonly note: string;
  readonly assertions: readonly Assertion[];
  readonly measures: readonly Measure[];
  readonly items: readonly number[];
  readonly jobs: readonly number[];
  readonly invocations: readonly Invocation[];
}

export interface Findings {
  readonly check: (name: string, ok: boolean, detail: string) => void;
  readonly measure: (name: string, value: number) => void;
  readonly item: (id: number) => void;
  readonly job: (id: number) => void;
  readonly used: (invocations: readonly Invocation[]) => void;
}

export class Inconclusive extends Error {}

export interface Collected {
  readonly findings: Findings;
  readonly result: (scenario: ScenarioName, verdict: Verdict, note: string) => ScenarioResult;
}

export function collector(): Collected {
  const assertions: Assertion[] = [];
  const measures: Measure[] = [];
  const items: number[] = [];
  const jobs: number[] = [];
  const invocations: Invocation[] = [];

  return {
    findings: {
      check: (name, ok, detail) => {
        assertions.push({ name, ok, detail });
      },
      measure: (name, value) => {
        measures.push({ name, value });
      },
      item: (id) => {
        items.push(id);
      },
      job: (id) => {
        jobs.push(id);
      },
      used: (seen) => {
        invocations.push(...seen);
      },
    },
    result: (scenario, verdict, note) => ({
      scenario,
      verdict: verdict === "pass" && assertions.some((entry) => !entry.ok) ? "fail" : verdict,
      note,
      assertions,
      measures,
      items,
      jobs,
      invocations: [...new Map(invocations.map((entry) => [entry.requestId, entry])).values()],
    }),
  };
}

const NOTE_LIMIT = 200;

function noteOf(error: Readonly<Error>): string {
  if (error instanceof CopyAnswerError) return `${error.path} answered ${String(error.status)}`;

  if (error instanceof z.ZodError) {
    return `an answer did not match its schema at ${error.issues[0]?.path.join(".") ?? ""}`;
  }

  return error.message.slice(0, NOTE_LIMIT);
}

export async function conclude(
  scenario: ScenarioName,
  work: (findings: Readonly<Findings>) => Promise<void>,
): Promise<ScenarioResult> {
  const { findings, result } = collector();

  try {
    await work(findings);
  } catch (error) {
    if (error instanceof Inconclusive) return result(scenario, "inconclusive", error.message);

    return result(scenario, "fail", error instanceof Error ? noteOf(error) : "unexpected failure");
  }

  return result(scenario, "pass", "");
}
