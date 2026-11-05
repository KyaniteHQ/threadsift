export const SETUP_CODE_MIN = 16;

export const SETUP_CODE_STATUSES = ["missing", "short", "set"] as const;

export type SetupCodeStatus = (typeof SETUP_CODE_STATUSES)[number];

export type SetupCodeProblem = Exclude<SetupCodeStatus, "set">;

export type SetupCodeCheck =
  | { readonly status: "set"; readonly code: string }
  | { readonly status: SetupCodeProblem };

export function checkConfiguredCode(code: string | undefined): SetupCodeCheck {
  if (code === undefined) {
    return { status: "missing" };
  }

  return code.length < SETUP_CODE_MIN ? { status: "short" } : { status: "set", code };
}
