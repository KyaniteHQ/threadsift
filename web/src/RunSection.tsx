import type { Resume } from "../../src/core/contract/import-list.ts";
import { Alert } from "./Alert.tsx";
import type { Outcome, Progress } from "./import-run.ts";
import {
  IMPORT,
  countLabel,
  failedLabel,
  progressLabel,
  resumePartialLabel,
  stoppedLabel,
  uncountedLabel,
} from "./import-text.ts";
import type { Check } from "./use-import-list.ts";
import { NOT_STARTED, type ImportRun, type RunState } from "./use-import-run.ts";

const COMPLETE: Resume = { kind: "complete" };

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
    <ul role="list" className="imp-counts">
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

  return run.phase === "ended" && run.outcome.ending !== "complete" ? run.outcome : null;
}

function alertOf(check: Check, run: RunState, total: number): string | null {
  if (run.phase === "ended") {
    const { ending, done } = run.outcome;

    return ending === "finished" || ending === "complete" || ending === "stopped"
      ? null
      : failedLabel(ending, done, total);
  }

  return run.phase === "idle" && check.status === "failed" ? IMPORT.checkFailed : null;
}

function resumeLine(resume: Resume, total: number): string | null {
  if (resume.kind === "complete") return IMPORT.resumeComplete;

  return resume.kind === "partial" ? resumePartialLabel(resume.done, total) : null;
}

function endedLine({ ending, done }: Readonly<Outcome>, total: number): string | null {
  if (ending === "finished") return IMPORT.finished;

  if (ending === "complete") return IMPORT.resumeComplete;

  return ending === "stopped" ? stoppedLabel(done, total) : null;
}

function lineOf(check: Check, run: RunState, total: number): string | null {
  if (run.phase === "running") {
    if (run.stopping) return IMPORT.stoppingStatus;

    return run.waiting ? IMPORT.waiting : progressLabel(run.progress.done, total);
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
    const { ending, seen, counts, uncounted } = run.outcome;
    const again = ending === "finished" || ending === "complete";

    return {
      label: again ? IMPORT.again : IMPORT.resume,
      accent: true,
      press: () => {
        runner.start(
          links,
          name,
          again ? { ...NOT_STARTED, seen: COMPLETE } : { counts, uncounted, seen },
        );
      },
    };
  }

  return {
    label: startLabel(resume),
    accent: true,
    press: () => {
      runner.start(links, name, { ...NOT_STARTED, seen: resume });
    },
  };
}

export function RunSection({
  check,
  links,
  run,
  runner,
  retry,
}: Readonly<{
  check: Check;
  links: readonly string[];
  run: RunState;
  runner: ImportRun;
  retry: () => void;
}>) {
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
      <Alert text={alert} />
      <output className="imp-status">
        {line === null ? null : <p className="imp-progress">{line}</p>}
        {progress === null ? null : <CountsList progress={progress} />}
      </output>
      {progress === null ? null : <p className="fld-help">{IMPORT.countsNote}</p>}
      {progress === null || progress.uncounted === 0 ? null : (
        <p className="fld-help">{uncountedLabel(progress.uncounted)}</p>
      )}
    </div>
  );
}
