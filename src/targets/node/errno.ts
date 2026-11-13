export function hasErrnoCode(
  error: unknown,
  ...codes: readonly string[]
): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && codes.includes(String(error.code));
}
