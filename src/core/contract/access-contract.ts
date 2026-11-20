export const SETUP_CODE_STATUSES = ["missing", "short", "set"] as const;

export type SetupCodeStatus = (typeof SETUP_CODE_STATUSES)[number];

export const REFUSAL_CODES = [
  "wrong-setup-code",
  "wrong-password",
  "wrong-current-password",
  "wrong-reset-code",
  "owner-exists",
  "locked",
  "setup-missing",
  "setup-short",
  "password-short",
  "password-long",
  "password-changed",
  "reset-missing",
  "reset-short",
  "reset-used",
  "no-owner",
] as const;

export type RefusalCode = (typeof REFUSAL_CODES)[number];
