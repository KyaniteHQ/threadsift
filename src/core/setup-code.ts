import type { SetupCodeStatus } from "./kinds.ts";
import type { Crypto } from "./ports.ts";

export const SETUP_CODE_MIN = 16;

export const RESET_CODE_MIN = 32;

export type SetupCodeProblem = Exclude<SetupCodeStatus, "set">;

type SetupCodeCheck =
  | { readonly status: "set"; readonly code: string }
  | { readonly status: SetupCodeProblem };

export function checkConfiguredCode(code: string | undefined, minimum: number): SetupCodeCheck {
  if (code === undefined) {
    return { status: "missing" };
  }

  return code.length < minimum ? { status: "short" } : { status: "set", code };
}

export function codeProof(crypto: Crypto, typed: string, configured: string): Promise<true | null> {
  return Promise.resolve(
    crypto.equal(crypto.sha256(typed), crypto.sha256(configured)) ? true : null,
  );
}
