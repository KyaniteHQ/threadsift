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

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a catch variable is unparsed by construction, and this function reduces it to a class name.
export function errorClassOf(error: unknown): string {
  return error instanceof Error ? error.constructor.name : "NotAnError";
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a catch variable is unparsed by construction, and this function reduces it to an allowlisted code.
export function databaseCodeOf(error: unknown, depth = 0): string {
  const failure = DatabaseErrorSchema.safeParse(error);

  if (!failure.success) return "unknown";

  if (failure.data.errcode !== undefined) return String(failure.data.errcode);

  const [constant] = (failure.data.message?.match(SQLITE_CONSTANT) ?? [])
    .filter((name) => SQLITE_CONSTANTS.has(name))
    .toSorted((first, second) => second.length - first.length);

  if (constant !== undefined) return constant;

  return depth < 2 ? databaseCodeOf(failure.data.cause, depth + 1) : "unknown";
}

export function logFailure(
  event: string,
  fields: Readonly<Record<string, string | number>>,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a catch variable is unparsed by construction, and this function reduces it to a class name.
  error: unknown,
): void {
  console.error(JSON.stringify({ event, ...fields, error: errorClassOf(error) }));
}
