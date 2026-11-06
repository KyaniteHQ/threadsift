import { passwordLength } from "../../src/core/passwords.ts";
import { SETUP } from "./access-text.ts";

export const LENGTH_PROBLEM = {
  short: SETUP.passwordTooShort,
  long: SETUP.passwordTooLong,
} as const;

export function lengthProblem(password: string): string | null {
  const length = passwordLength(password);

  return length === "ok" ? null : LENGTH_PROBLEM[length];
}
