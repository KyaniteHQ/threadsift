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
  fields: Readonly<Record<string, number | string | null | readonly number[]>>,
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

export interface FailureLine {
  readonly event: string;
  readonly fields: Readonly<Record<string, string | number>>;
}

const ABSENT_CODES = new Map([
  ["databaseCode", "unknown"],
  ["errno", "none"],
]);

function codesOf(cause: unknown): Readonly<Record<string, string>> {
  const found = { databaseCode: databaseCodeOf(cause), errno: errnoCodeOf(cause) };

  return Object.fromEntries(
    Object.entries(found).filter(([name, code]) => code !== ABSENT_CODES.get(name)),
  );
}

export function reportFailure(failure: Readonly<FailureLine>, cause: unknown): void {
  try {
    logFailure(failure.event, { ...failure.fields, ...codesOf(cause) }, cause);
  } catch {
    console.error(JSON.stringify({ event: "failure-unreadable", failed: failure.event }));
  }
}

export async function readOrAssume<Answer>(
  assumed: Answer,
  failure: Readonly<FailureLine>,
  read: () => Promise<Answer>,
): Promise<Answer> {
  try {
    return await read();
  } catch (cause) {
    reportFailure(failure, cause);

    return assumed;
  }
}

export async function bestEffort<Done>(
  failure: Readonly<FailureLine>,
  cleanup: () => Promise<Done>,
): Promise<void> {
  await readOrAssume(undefined, failure, async () => {
    await cleanup();
  });
}

export async function withCleanup<Result, Done>(
  failure: Readonly<FailureLine>,
  body: () => Promise<Result>,
  cleanup: () => Promise<Done>,
): Promise<Result> {
  let result: Result;

  try {
    result = await body();
  } catch (error) {
    await bestEffort(failure, cleanup);

    throw error;
  }

  await cleanup();

  return result;
}
