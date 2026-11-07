import { copyNames } from "./cloudflare.ts";
import { currentVersion } from "./copy-control.ts";
import { CopyAnswerError, publicMessage } from "./copy-error.ts";
import { SKEW_MS } from "./pace.ts";
import { withStage } from "./stage.ts";
import { type Invocation, awaitInvocations } from "./telemetry.ts";

const APP_ERROR = "Internal error";
const LOG_WAIT_MS = 180_000;

export type Outcome = "clean" | "app-500" | "edge-failure" | "other-answer" | "other" | "stopped";

export interface Failure {
  readonly outcome: Outcome;
  readonly route: string | null;
  readonly status: number | null;
  readonly at: number;
}

export interface Evidence {
  readonly requestId: string | null;
  readonly exceptionLogged: boolean | null;
  readonly evidence: "found" | "missing" | "unreadable" | null;
}

export const NO_EVIDENCE: Evidence = { requestId: null, exceptionLogged: null, evidence: null };

export function classify(error: Readonly<Error>): Failure {
  if (!(error instanceof CopyAnswerError)) {
    return { outcome: "other", route: null, status: null, at: Date.now() };
  }

  const { status, path: route, at } = error;

  if (status === 500 && error.answer === APP_ERROR)
    return { outcome: "app-500", route, status, at };

  return { outcome: status >= 500 ? "edge-failure" : "other-answer", route, status, at };
}

export function needsLog(failure: Readonly<Failure>): boolean {
  return failure.outcome === "app-500" || failure.outcome === "edge-failure";
}

function matching(failure: Readonly<Failure>) {
  return (entry: Readonly<Invocation>) =>
    entry.name === failure.route &&
    entry.status === failure.status &&
    Math.abs(entry.at - failure.at) <= 2 * SKEW_MS;
}

export async function exceptionLog(pr: number, failure: Readonly<Failure>): Promise<Evidence> {
  const names = copyNames(pr);

  try {
    return await withStage(names, null, async (stage) => {
      const version = await currentVersion(stage, names.name);

      const { found } = await awaitInvocations(
        stage,
        { version, trigger: "fetch" },
        { from: failure.at - 2 * SKEW_MS, to: failure.at + 2 * SKEW_MS },
        { deadlineMs: LOG_WAIT_MS, enough: (seen) => seen.some(matching(failure)) },
      );

      const match = found.find(matching(failure));

      return match === undefined
        ? { requestId: null, exceptionLogged: null, evidence: "missing" }
        : { requestId: match.requestId, exceptionLogged: match.errorLogged, evidence: "found" };
    });
  } catch (error) {
    process.stderr.write(
      `The invocation log could not be read: ${error instanceof Error ? publicMessage(error) : "unknown error"}\n`,
    );

    return { requestId: null, exceptionLogged: null, evidence: "unreadable" };
  }
}
