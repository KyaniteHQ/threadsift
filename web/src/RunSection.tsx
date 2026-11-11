import type { Resume } from "../../src/core/import-list.ts";
import type { Outcome, Progress } from "./import-run.ts";
import {
  IMPORT,
  countLabel,
  failedLabel,
  progressLabel,
  resumePartialLabel,
  stoppedLabel,
} from "./import-text.ts";
import type { Check } from "./use-import-list.ts";
import { NOT_STARTED, type ImportRun, type RunState } from "./use-import-run.ts";

interface Action {
  readonly label: string;
  readonly accent: boolean;
  readonly press: (() => void) | null;
}

function startLabel(resume: Resume): string {
  if (resume.kind === "complete") return IMPORT.again;

  return resume.kind === "partial" ? IMPORT.resume : IMPORT.start;
}

function CountsList({ progress }: Readonly<{ progress: Progress }>) {
  const { counts } = progress;

  return (
    <ul className="imp-counts">
      <li>{countLabel(counts.added, "added")}</li>
      <li>{countLabel(counts.known, "known")}</li>
      <li>{countLabel(counts.refused, "refused")}</li>
    </ul>
  );
}

function Meter({ progress, total }: Readonly<{ progress: Progress; total: number }>) {
  return (
    <progress
      className="imp-bar"
      aria-label={IMPORT.progressLabel}
      max={total}
      value={progress.done}
    />
  );
}

function progressOf(run: RunState): Progress | null {
  if (run.phase === "running") return run.progress;

  return run.phase === "ended" ? run.outcome : null;
}

function alertOf(check: Check, run: RunState, total: number): string | null {
  if (run.phase === "ended") {
    const { ending, done } = run.outcome;

    return ending === "finished" || ending === "stopped" ? null : failedLabel(ending, done, total);
  }

  return run.phase === "idle" && check.status === "failed" ? IMPORT.checkFailed : null;
}

function resumeLine(resume: Resume, total: number): string | null {
  if (resume.kind === "complete") return IMPORT.resumeComplete;

  return resume.kind === "partial" ? resumePartialLabel(resume.done, total) : null;
}

function endedLine({ ending, done }: Readonly<Outcome>, total: number): string | null {
  if (ending === "finished") return IMPORT.finished;

  return ending === "stopped" ? stoppedLabel(done, total) : null;
}

function lineOf(check: Check, run: RunState, total: number): string | null {
  if (run.phase === "running") {
    return run.stopping ? IMPORT.stopping : progressLabel(run.progress.done, total);
  }

  if (run.phase === "ended") return endedLine(run.outcome, total);

  if (check.status === "checking") return IMPORT.checking;

  return check.status === "ready" ? resumeLine(check.resume, total) : null;
}

function actionOf(
  check: Check,
  run: RunState,
  links: readonly string[],
  runner: ImportRun,
  retry: () => void,
): Action {
  if (run.phase === "running") {
    return run.stopping
      ? { label: IMPORT.stopping, accent: false, press: null }
      : { label: IMPORT.stop, accent: false, press: runner.stop };
  }

  if (check.status === "failed") return { label: IMPORT.retry, accent: true, press: retry };

  if (check.status !== "ready") return { label: IMPORT.start, accent: true, press: null };

  const { name, resume } = check;

  if (run.phase === "ended") {
    return run.outcome.ending === "finished"
      ? {
          label: IMPORT.again,
          accent: true,
          press: () => {
            runner.start(links, name, NOT_STARTED);
          },
        }
      : {
          label: IMPORT.resume,
          accent: true,
          press: () => {
            runner.start(links, name, run.outcome);
          },
        };
  }

  const from = resume.kind === "partial" ? { ...NOT_STARTED, done: resume.done } : NOT_STARTED;

  return {
    label: startLabel(resume),
    accent: true,
    press: () => {
      runner.start(links, name, from);
    },
  };
}

const IDLE: RunState = { phase: "idle" };

function runOf(state: RunState, check: Check): RunState {
  if (state.phase === "running") return state;

  return state.phase === "ended" && check.status === "ready" && state.name === check.name
    ? state
    : IDLE;
}

export function RunSection({
  check,
  links,
  runner,
  retry,
}: Readonly<{
  check: Check;
  links: readonly string[];
  runner: ImportRun;
  retry: () => void;
}>) {
  const run = runOf(runner.state, check);
  const total = links.length;
  const idle = check.status === "none";
  const action = idle ? null : actionOf(check, run, links, runner, retry);
  const progress = progressOf(run);
  const alert = alertOf(check, run, total);
  const line = lineOf(check, run, total);

  return (
    <div className="sec imp-run" data-idle={idle}>
      {action === null ? null : (
        <div className="imp-actions">
          <button
            type="button"
            className={action.accent ? "btn btn-acc" : "btn"}
            aria-disabled={action.press === null}
            onClick={action.press ?? undefined}
          >
            {action.label}
          </button>
        </div>
      )}
      {progress === null ? null : <Meter progress={progress} total={total} />}
      {alert === null ? null : (
        <p role="alert" className="fld-err">
          {alert}
        </p>
      )}
      <output className="imp-status">
        {line === null ? null : <p className="imp-progress">{line}</p>}
        {progress === null ? null : <CountsList progress={progress} />}
      </output>
      {progress === null ? null : <p className="fld-help">{IMPORT.countsNote}</p>}
    </div>
  );
}
