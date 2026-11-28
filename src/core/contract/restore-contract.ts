import { z } from "zod";

import { CLAIM_MARGIN_MS } from "./job-contract.ts";
import { RESTORE_PART_BYTES } from "./limits.ts";
import { DAY_MS } from "./time-units.ts";
import { WholeCount } from "./whole-count.ts";

export const RESTORE_STATES = ["uploading", "running", "done", "failed", "cancelled"] as const;

export const COPY_RESTORE_PHASES = [
  "check",
  "tables",
  "files",
  "search",
  "highlights",
  "finish",
] as const;

export const RUNNING_RESTORE_PHASES = [...COPY_RESTORE_PHASES, "undoing"] as const;

export const RESTORE_PHASES = ["upload", ...RUNNING_RESTORE_PHASES] as const;

export const RESTORING_CODE = "restoring";

export const PASTE_RESTORING_REFUSAL = {
  error:
    "The library is being restored and takes no new link until the restore has finished. Reads and deletes work meanwhile.",
  code: RESTORING_CODE,
} as const;

export const RESTORING_REFUSAL = {
  error:
    "The library is being restored and saves nothing new until the restore has finished. Reads and deletes work meanwhile.",
  code: RESTORING_CODE,
} as const;

export type RunningPhase = (typeof COPY_RESTORE_PHASES)[number];

export const RESTORE_MAX_BYTES = 50_000_000_000;

const RESTORE_MAX_PARTS = Math.ceil(RESTORE_MAX_BYTES / RESTORE_PART_BYTES);

export const RESTORE_UNIT_DEADLINE_MS = 600_000;

export const RESTORE_SETTLE_MS = RESTORE_UNIT_DEADLINE_MS + CLAIM_MARGIN_MS;

export const RESTORE_PARTS_KEEP_MS = DAY_MS;

export const RESTORE_UNIT_LINES = 500;

export const RESTORE_UNIT_BYTES = 1_500_000;

export const RESTORE_LINE_BYTES = 8 * 1024 * 1024;

export const RESTORE_CHECK_BYTES = RESTORE_LINE_BYTES + 256 * 1024;

export const RESTORE_BIND_BYTES = 1_900_000;

export const RESTORE_FILE_ENTRIES = 1000;

export const RESTORE_FILE_BYTES = 8 * 1024 * 1024;

export const RESTORE_INDEX_ITEMS = 8;

export const RESTORE_INDEX_BYTES = 4 * 1024 * 1024;

export const RESTORED_FILES = "files";

export const MISSING_FILES = "missing-files";

export const KEPT_HIGHLIGHTS = "highlights-as-exported";

export const RESTORE_ANCHOR_BYTES = 256 * 1024;

export const RESTORE_MANIFEST_BYTES = 4 * 1024 * 1024;

export const RESTORE_DIRECTORY_BYTES = 256 * 1024 * 1024;

export const RESTORE_REFUSALS = [
  "incomplete-upload",
  "not-a-zip",
  "unsupported-compression",
  "bad-entry-name",
  "no-manifest",
  "format",
  "other-release",
  "unknown-table",
  "unknown-column",
  "missing-column",
  "crc",
] as const;

export type RestoreRefusal = (typeof RESTORE_REFUSALS)[number];

const RESTORE_ERROR_CODES = [
  ...RESTORE_REFUSALS,
  "library-not-empty",
  "restore-open",
  "not-uploading",
  "vault-busy",
] as const;

export const RestoreErrorSchema = z.object({
  error: z.string(),
  code: z.enum(RESTORE_ERROR_CODES).optional(),
});

export type RestoreErrorCode = (typeof RESTORE_ERROR_CODES)[number];

type RestoreAnswerCode = RestoreErrorCode | "finished" | "superseded" | "not-resumable";

export function restoreAnswerSchema<
  const Codes extends readonly [RestoreAnswerCode, ...RestoreAnswerCode[]],
>(...codes: Codes) {
  return z.object({ error: z.string(), code: z.enum(codes) });
}

export const RESTORE_FAILURES = [...RESTORE_REFUSALS, "gave-up"] as const;

export type RestoreFailure = (typeof RESTORE_FAILURES)[number];

export const CountsSchema = z.record(z.string(), WholeCount).readonly();

export type Counts = z.infer<typeof CountsSchema>;

const EntrySchema = z.object({ table: z.string(), start: WholeCount, size: WholeCount }).readonly();

export const CursorSchema = z
  .object({
    file: WholeCount,
    entry: EntrySchema.nullable(),
    offset: WholeCount,
    line: WholeCount,
  })
  .readonly();

export type Cursor = z.infer<typeof CursorSchema>;

const START_CURSOR: Cursor = { file: 0, entry: null, offset: 0, line: 0 };

export const UndoCursorSchema = z.object({ units: WholeCount }).readonly();

type UndoCursor = z.infer<typeof UndoCursorSchema>;

const START_UNDO: UndoCursor = { units: 0 };

export const FilesCursorSchema = z.object({ owner: WholeCount, key: z.string() }).readonly();

const START_FILES: z.infer<typeof FilesCursorSchema> = { owner: 0, key: "" };

export const ItemsCursorSchema = z.object({ after: WholeCount }).readonly();

const START_ITEMS: z.infer<typeof ItemsCursorSchema> = { after: 0 };

export const CheckCursorSchema = z
  .object({
    entry: WholeCount,
    offset: WholeCount,
    line: WholeCount,
    crc: WholeCount,
    rows: CountsSchema,
  })
  .readonly();

export type CheckCursor = z.infer<typeof CheckCursorSchema>;

const START_CHECK: CheckCursor = { entry: 0, offset: 0, line: 0, crc: 0, rows: {} };

const PHASE_STARTS = {
  check: START_CHECK,
  tables: START_CURSOR,
  files: START_FILES,
  search: START_ITEMS,
  highlights: START_ITEMS,
  finish: START_CURSOR,
  undoing: START_UNDO,
} as const satisfies {
  readonly [Phase in (typeof RUNNING_RESTORE_PHASES)[number]]:
    | Cursor
    | CheckCursor
    | z.infer<typeof FilesCursorSchema>
    | z.infer<typeof ItemsCursorSchema>
    | UndoCursor;
};

export function entering(phase: keyof typeof PHASE_STARTS) {
  return { phase, cursor: JSON.stringify(PHASE_STARTS[phase]) };
}

const Id = z.number().int().positive();

const Library = { libraryEmpty: z.boolean() };

export const RUN_COUNTS = {
  restored: CountsSchema,
  dropped: CountsSchema,
  files: WholeCount,
  missingFiles: WholeCount,
  keptHighlights: WholeCount,
};

export const RestoreStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("none"), ...Library }),
  z.object({
    state: z.literal("uploading"),
    ...Library,
    id: Id,
    bytes: WholeCount,
    parts: WholeCount,
    partBytes: WholeCount,
    received: z.array(Id).readonly(),
  }),
  z.object({
    state: z.literal("running"),
    ...Library,
    id: Id,
    phase: z.enum(COPY_RESTORE_PHASES),
    ...RUN_COUNTS,
  }),
  z.object({ state: z.literal("cancelling"), ...Library, id: Id }),
  z.object({
    state: z.literal("done"),
    ...Library,
    id: Id,
    finishedAt: z.number().int(),
    ...RUN_COUNTS,
  }),
  z.object({
    state: z.literal("failed"),
    ...Library,
    id: Id,
    failure: z.enum(RESTORE_FAILURES),
    holdsLibrary: z.boolean(),
    resumable: z.boolean(),
    cancelFailed: z.boolean(),
  }),
  z.object({ state: z.literal("cancelled"), ...Library, id: Id }),
]);

export type RestoreStatus = z.infer<typeof RestoreStatusSchema>;

export const NewRestoreSchema = z.object({
  bytes: z.number().int().min(1).max(RESTORE_MAX_BYTES),
  parts: z.number().int().min(1).max(RESTORE_MAX_PARTS),
});

export const StartedRestoreSchema = z.object({ id: Id, partBytes: Id });

export function partsOf(bytes: number, partBytes: number = RESTORE_PART_BYTES): number {
  return Math.ceil(bytes / partBytes);
}

export function partLength(
  { bytes, partBytes }: Readonly<{ bytes: number; partBytes: number }>,
  part: number,
): number {
  return Math.min(partBytes, bytes - (part - 1) * partBytes);
}
