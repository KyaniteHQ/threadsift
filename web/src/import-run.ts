import { type Resume, doneOf, nextBatch, resumeOf } from "../../src/core/contract/import-list.ts";
import { type Counts, postBatch, readImportState } from "./import-api.ts";
import { type Landing, batchLanding } from "./import-landing.ts";
import type { FailedEnding } from "./import-text.ts";
import { IMPORT_BATCH_LINKS } from "./write-deadlines.ts";

export interface Progress {
  readonly done: number;
  readonly counts: Counts;
  readonly uncounted: number;
}

type Ending = "finished" | "complete" | "stopped" | FailedEnding;

export type Outcome = Progress & { readonly ending: Ending; readonly seen: Resume };

export type Position = Omit<Progress, "done"> & { readonly seen: Resume };

export interface Run {
  readonly report: (progress: Progress) => void;
  readonly waiting: (waiting: boolean) => void;
  readonly signal: AbortSignal;
}

type Step =
  | { readonly kind: "advanced"; readonly progress: Progress }
  | { readonly kind: "ended"; readonly ending: Ending; readonly saved?: string | null };

interface Place {
  readonly progress: Readonly<Progress>;
  readonly written: string | null;
}

const ENDING_OF = {
  stopped: "stopped",
  lost: "unconfirmed",
  unreachable: "network",
} as const satisfies Readonly<Record<Exclude<Landing, "landed">, Ending>>;

function summed(before: Counts, batch: Counts): Counts {
  return {
    added: before.added + batch.added,
    known: before.known + batch.known,
    refused: before.refused + batch.refused,
  };
}

const ended = (ending: Ending): Step => ({ kind: "ended", ending });

export function plannedOf({ seen, ...tally }: Readonly<Position>): Progress {
  return { ...tally, done: seen.kind === "partial" ? seen.done : 0 };
}

function sameResume(saved: Resume, seen: Resume): boolean {
  return saved.kind === "partial" && seen.kind === "partial"
    ? saved.done === seen.done
    : saved.kind === seen.kind;
}

async function savedCursor(
  name: string,
  signal: AbortSignal,
): Promise<{ readonly cursor: string | null } | null> {
  try {
    const state = await readImportState(name, signal);

    return { cursor: state?.cursor ?? null };
  } catch {
    return null;
  }
}

async function confirmed(
  attempt: Parameters<typeof batchLanding>[0],
  { waiting, signal }: Readonly<Run>,
): Promise<Landing> {
  waiting(true);

  try {
    return await batchLanding(attempt, signal);
  } finally {
    waiting(false);
  }
}

async function stepOf(
  links: readonly string[],
  name: string,
  { progress, written }: Readonly<Place>,
  run: Readonly<Run>,
): Promise<Step> {
  const before = await readImportState(name, run.signal).catch(() => "failed" as const);

  if (before === "failed") return ended(run.signal.aborted ? "stopped" : "network");

  const saved = before?.cursor ?? null;

  if (saved !== written) return { kind: "ended", ending: "stopped", saved };

  const request = nextBatch(links, progress.done, name, saved, IMPORT_BATCH_LINKS);
  const done = progress.done + request.links.length;
  const answer = await postBatch(request);

  if (answer.kind === "saved") {
    return {
      kind: "advanced",
      progress: { ...progress, done, counts: summed(progress.counts, answer.counts) },
    };
  }

  if (answer.kind !== "unanswered") return ended(answer.kind);

  const landing = await confirmed({ name, through: done, before }, run);

  if (landing !== "landed") return ended(ENDING_OF[landing]);

  return {
    kind: "advanced",
    progress: { ...progress, done, uncounted: progress.uncounted + request.links.length },
  };
}

async function batches(
  links: readonly string[],
  name: string,
  start: Readonly<Place>,
  run: Readonly<Run>,
): Promise<Outcome> {
  let { progress, written } = start;

  while (progress.done < links.length) {
    if (run.signal.aborted) {
      return { ...progress, ending: "stopped", seen: resumeOf(written, links.length) };
    }

    // oxlint-disable-next-line eslint/no-await-in-loop -- Batches go one after the other, so the saved cursor is the last batch that finished.
    const step = await stepOf(links, name, { progress, written }, run);

    if (step.kind === "ended") {
      const last = step.saved === undefined ? written : step.saved;
      const done = step.saved === undefined ? progress.done : doneOf(step.saved);

      return { ...progress, done, ending: step.ending, seen: resumeOf(last, links.length) };
    }

    progress = step.progress;
    written = String(progress.done);
    run.report(progress);
  }

  return { ...progress, ending: "finished", seen: resumeOf(written, links.length) };
}

export async function runImport(
  links: readonly string[],
  name: string,
  position: Readonly<Position>,
  run: Readonly<Run>,
): Promise<Outcome> {
  const { seen } = position;
  const planned = plannedOf(position);
  const read = await savedCursor(name, run.signal);

  if (read === null) {
    return { ...planned, ending: run.signal.aborted ? "stopped" : "network", seen };
  }

  const saved = read.cursor;

  const found = resumeOf(saved, links.length);

  if (sameResume(found, seen))
    return batches(links, name, { progress: planned, written: saved }, run);

  const progress = { ...planned, done: doneOf(saved) };

  if (found.kind === "complete") return { ...progress, ending: "complete", seen: found };

  run.report(progress);

  return batches(links, name, { progress, written: saved }, run);
}
