import { type RestoreStatus, partsOf } from "../../src/core/restore-contract.ts";
import { createRestore, fetchRestoreStatus, sendPart, startRestore } from "./restore-api.ts";
import { matchesFingerprint, rememberFingerprint } from "./restore-fingerprint.ts";
import { RESTORE_TEXT, refusalLabel } from "./restore-text.ts";
import type { Outcome } from "./use-settings-action.ts";

export type Progress =
  | Readonly<{ kind: "sending"; sent: number; parts: number }>
  | Readonly<{ kind: "checking" }>;

interface UploadSteps {
  readonly progress: (progress: Progress) => void;
  readonly refresh: () => Promise<RestoreStatus | null>;
}

type Chosen = Readonly<Pick<File, "name" | "size" | "lastModified" | "slice">>;

interface Target {
  readonly id: number;
  readonly parts: number;
  readonly partBytes: number;
  readonly received: readonly number[];
}

type Prepared =
  | Readonly<{ kind: "ready"; target: Target }>
  | Readonly<{ kind: "stop"; outcome: Outcome }>;

function failure(text: string): Outcome {
  return { kind: "error", text };
}

function resumed(file: Chosen, view: Extract<RestoreStatus, { state: "uploading" }>): Prepared {
  const { id, parts, partBytes, received } = view;

  if (file.size !== view.bytes || !matchesFingerprint(id, file)) {
    return { kind: "stop", outcome: failure(RESTORE_TEXT.wrongFile) };
  }

  rememberFingerprint(id, file);

  return { kind: "ready", target: { id, parts, partBytes, received } };
}

async function prepare(file: Chosen, view: RestoreStatus | null): Promise<Prepared> {
  if (view?.state === "uploading") return resumed(file, view);

  const created = await createRestore(file.size, partsOf(file.size));

  if (created.kind === "refused") {
    const current = created.code === "restore-open" ? await fetchRestoreStatus() : null;

    return current?.state === "uploading"
      ? resumed(file, current)
      : { kind: "stop", outcome: failure(refusalLabel(created.code)) };
  }

  const { id, partBytes } = created;

  rememberFingerprint(id, file);

  return {
    kind: "ready",
    target: { id, partBytes, parts: partsOf(file.size, partBytes), received: [] },
  };
}

async function sendOnce(id: number, part: number, bytes: Readonly<Blob>): Promise<boolean> {
  try {
    await sendPart(id, part, bytes);

    return true;
  } catch {
    return false;
  }
}

function missingParts({ parts, received }: Target): readonly number[] {
  const have = new Set(received);

  return Array.from({ length: parts }, (_, at) => at + 1).filter((part) => !have.has(part));
}

async function sendMissing(
  file: Chosen,
  target: Target,
  progress: UploadSteps["progress"],
  at = 0,
): Promise<boolean> {
  const part = missingParts(target)[at];

  if (part === undefined) return true;

  const start = (part - 1) * target.partBytes;

  if (!(await sendOnce(target.id, part, file.slice(start, start + target.partBytes)))) {
    return false;
  }

  progress({ kind: "sending", sent: target.received.length + at + 1, parts: target.parts });

  return sendMissing(file, target, progress, at + 1);
}

async function startedFrom({ id }: Target, { refresh }: UploadSteps): Promise<Outcome | null> {
  const started = await startRestore(id);
  const next = await refresh();

  if (started.kind === "started" || next?.state === "failed") return null;

  return failure(refusalLabel(started.code));
}

export async function uploadZip(
  file: Chosen,
  view: RestoreStatus | null,
  steps: UploadSteps,
): Promise<Outcome | null> {
  const prepared = await prepare(file, view);

  if (prepared.kind === "stop") return prepared.outcome;

  const { target } = prepared;

  steps.progress({ kind: "sending", sent: target.received.length, parts: target.parts });

  if (!(await sendMissing(file, target, steps.progress))) {
    await steps.refresh();

    return failure(RESTORE_TEXT.uploadFailed);
  }

  steps.progress({ kind: "checking" });

  return startedFrom(target, steps);
}
