import type { RefusalCode } from "../../../core/contract/access-contract.ts";
import { groupedNumber } from "../../../core/contract/format.ts";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  type PasswordProblem,
} from "../../../core/contract/passwords.ts";
import { RESET_CODE_MIN, SETUP_CODE_MIN } from "../../../core/contract/setup-code.ts";

const WRONG_PASSWORD = "The password is wrong";

interface RefusalText {
  readonly status: number;
  readonly error: string;
}

const REFUSALS = {
  "owner-exists": { status: 409, error: "An owner exists already" },
  "setup-missing": {
    status: 503,
    error: "This Instance has no setup code",
  },
  "setup-short": {
    status: 503,
    error: `The setup code is shorter than ${SETUP_CODE_MIN} characters, so it is not used`,
  },
  "wrong-setup-code": { status: 403, error: "The setup code is wrong" },
  "wrong-password": { status: 403, error: WRONG_PASSWORD },
  "wrong-current-password": { status: 403, error: WRONG_PASSWORD },
  "wrong-reset-code": { status: 403, error: "The reset code is wrong" },
  "password-short": {
    status: 400,
    error: `The password must have at least ${PASSWORD_MIN} characters`,
  },
  "password-long": {
    status: 400,
    error: `The password must have at most ${groupedNumber(PASSWORD_MAX)} characters`,
  },
  "password-changed": {
    status: 409,
    error: "The password changed while this call ran, so nothing was done",
  },
  "reset-missing": { status: 503, error: "This Instance has no reset code" },
  "reset-short": {
    status: 503,
    error: `The reset code is shorter than ${RESET_CODE_MIN} characters, so it is not used`,
  },
  "reset-used": { status: 409, error: "The reset code was used already" },
  "no-owner": { status: 409, error: "This Instance has no owner yet" },
} as const satisfies Readonly<Record<Exclude<RefusalCode, "locked">, RefusalText>>;

export type RefusalName = keyof typeof REFUSALS;

export interface Refused<Name extends RefusalName> {
  readonly kind: "refused";
  readonly status: (typeof REFUSALS)[Name]["status"];
  readonly body: { readonly error: string; readonly code: Name };
}

export interface LockedOut {
  readonly kind: "refused";
  readonly status: 429;
  readonly body: { readonly error: string; readonly code: "locked" };
  readonly retryAfter: number;
}

export function refused<Name extends RefusalName>(name: Name): Refused<Name> {
  const { status, error } = REFUSALS[name];

  return { kind: "refused", status, body: { error, code: name } };
}

export function lockedOut(retryAfter: number): LockedOut {
  return {
    kind: "refused",
    status: 429,
    body: { error: "Too many wrong tries", code: "locked" },
    retryAfter,
  };
}

export function badPassword(problem: PasswordProblem) {
  return refused(`password-${problem}`);
}
