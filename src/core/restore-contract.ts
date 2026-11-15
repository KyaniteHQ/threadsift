import { z } from "zod";

import { RUNNING_RESTORE_PHASES } from "./kinds.ts";
import { RESTORE_PART_BYTES } from "./limits.ts";

export type RunningPhase = (typeof RUNNING_RESTORE_PHASES)[number];

export const RESTORE_MAX_BYTES = 50_000_000_000;

export const RESTORE_MAX_PARTS = Math.ceil(RESTORE_MAX_BYTES / RESTORE_PART_BYTES);

export const RESTORE_UNIT_DEADLINE_MS = 600_000;

export const RESTORE_UNIT_LINES = 500;

export const RESTORE_UNIT_BYTES = 1_500_000;

export const RESTORE_LINE_BYTES = 8 * 1024 * 1024;

export const RESTORE_CHECK_BYTES = RESTORE_LINE_BYTES + 256 * 1024;

export const RESTORE_BIND_BYTES = 1_900_000;

export const RESTORE_MANIFEST_BYTES = 4 * 1024 * 1024;

export const RESTORE_DIRECTORY_BYTES = 256 * 1024 * 1024;

export const RESTORE_REFUSALS = [
  "incomplete-upload",
  "not-a-zip",
  "unsupported-compression",
  "bad-entry-name",
  "no-manifest",
  "format",
  "newer-release",
  "unknown-table",
  "unknown-column",
  "missing-column",
  "crc",
] as const;

export type RestoreRefusal = (typeof RESTORE_REFUSALS)[number];

export const RESTORE_ERROR_CODES = [
  ...RESTORE_REFUSALS,
  "library-not-empty",
  "restore-open",
] as const;

export const RestoreErrorSchema = z.object({
  error: z.string(),
  code: z.enum(RESTORE_ERROR_CODES).optional(),
});

export type RestoreErrorCode = (typeof RESTORE_ERROR_CODES)[number];

export const RESTORE_FAILURES = [...RESTORE_REFUSALS, "gave-up"] as const;

export type RestoreFailure = (typeof RESTORE_FAILURES)[number];

const WholeCount = z.number().int().nonnegative();

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

export const START_CURSOR: Cursor = { file: 0, entry: null, offset: 0, line: 0 };

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

export const START_CHECK: CheckCursor = { entry: 0, offset: 0, line: 0, crc: 0, rows: {} };

const Id = z.number().int().positive();

const Library = { libraryEmpty: z.boolean() };

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
    phase: z.enum(RUNNING_RESTORE_PHASES),
    restored: CountsSchema,
    dropped: CountsSchema,
  }),
  z.object({
    state: z.literal("done"),
    ...Library,
    id: Id,
    finishedAt: z.number().int(),
    restored: CountsSchema,
    dropped: CountsSchema,
  }),
  z.object({
    state: z.literal("failed"),
    ...Library,
    id: Id,
    failure: z.enum(RESTORE_FAILURES),
  }),
]);

export type RestoreStatus = z.infer<typeof RestoreStatusSchema>;

export const NewRestoreSchema = z.object({
  bytes: z.number().int().min(1).max(RESTORE_MAX_BYTES),
  parts: z.number().int().min(1).max(RESTORE_MAX_PARTS),
});

export const StartedRestoreSchema = z.object({ id: Id, partBytes: Id });

export const RefusalSchema = z.object({
  error: z.string(),
  code: z.enum(RESTORE_REFUSALS),
});

export function partsOf(bytes: number, partBytes: number = RESTORE_PART_BYTES): number {
  return Math.ceil(bytes / partBytes);
}

export function partLength(
  { bytes, partBytes }: Readonly<{ bytes: number; partBytes: number }>,
  part: number,
): number {
  return Math.min(partBytes, bytes - (part - 1) * partBytes);
}
