import { passwordLength } from "../../src/core/passwords.ts";
import { SETUP } from "./access-text.ts";
import type { FieldState } from "./use-form.ts";

export const LENGTH_PROBLEM = {
  short: SETUP.passwordTooShort,
  long: SETUP.passwordTooLong,
} as const;

function lengthProblem(password: string): string | null {
  const length = passwordLength(password);

  return length === "ok" ? null : LENGTH_PROBLEM[length];
}

export function checkNewPassword(password: FieldState, confirm: FieldState): boolean {
  const problem = lengthProblem(password.value);
  const mismatch = password.value === confirm.value ? null : SETUP.passwordMismatch;
  password.fail(problem);
  confirm.fail(problem === null ? mismatch : null);

  return problem === null && mismatch === null;
}
