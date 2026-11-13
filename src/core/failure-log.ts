import { z } from "zod";

const SQLITE_CONSTANTS = new Set([
  "SQLITE_BUSY",
  "SQLITE_CORRUPT",
  "SQLITE_CONSTRAINT",
  "SQLITE_CONSTRAINT_CHECK",
  "SQLITE_CONSTRAINT_FOREIGNKEY",
  "SQLITE_CONSTRAINT_NOTNULL",
  "SQLITE_CONSTRAINT_PRIMARYKEY",
  "SQLITE_CONSTRAINT_TRIGGER",
  "SQLITE_CONSTRAINT_UNIQUE",
  "SQLITE_ERROR",
  "SQLITE_FULL",
  "SQLITE_IOERR",
  "SQLITE_LOCKED",
  "SQLITE_READONLY",
  "SQLITE_TOOBIG",
]);

const SQLITE_CONSTANT = /SQLITE_[A-Z_]+/gu;

const DatabaseErrorSchema = z.looseObject({
  message: z.string().optional(),
  errcode: z.int().min(1).max(0xffff).optional(),
  cause: z.unknown().optional(),
});

export function errorClassOf(cause: unknown): string {
  return cause instanceof Error ? cause.constructor.name : "NotAnError";
}

const ErrnoSchema = z.looseObject({ code: z.string().regex(/^E[A-Z0-9]+$/u) });

export function errnoCodeOf(cause: unknown): string {
  const errno = ErrnoSchema.safeParse(cause);

  return errno.success ? errno.data.code : "none";
}

export function databaseCodeOf(cause: unknown, depth = 0): string {
  const failure = DatabaseErrorSchema.safeParse(cause);

  if (!failure.success) return "unknown";

  if (failure.data.errcode !== undefined) return String(failure.data.errcode);

  const [constant] = (failure.data.message?.match(SQLITE_CONSTANT) ?? [])
    .filter((name) => SQLITE_CONSTANTS.has(name))
    .toSorted((first, second) => second.length - first.length);

  if (constant !== undefined) return constant;

  return depth < 2 ? databaseCodeOf(failure.data.cause, depth + 1) : "unknown";
}

export function report(
  event: string,
  fields: Readonly<Record<string, number | string | readonly number[]>>,
): void {
  console.warn(JSON.stringify({ event, ...fields }));
}

export function logFailure(
  event: string,
  fields: Readonly<Record<string, string | number>>,
  cause: unknown,
): void {
  console.error(JSON.stringify({ event, ...fields, error: errorClassOf(cause) }));
}
