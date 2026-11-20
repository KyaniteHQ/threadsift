import type { VaultRefusal } from "../contract/vault-contract.ts";

type RefusalReason = VaultRefusal["reason"];

const INTERNAL_REASONS = ["stale", "invalid-response", "branch-moved"] as const;

type InternalReason = (typeof INTERNAL_REASONS)[number];

type FailureReason = RefusalReason | InternalReason;

const INTERNAL: ReadonlySet<FailureReason> = new Set(INTERNAL_REASONS);

function isInternal(reason: FailureReason): reason is InternalReason {
  return INTERNAL.has(reason);
}

export function refusalReason(reason: FailureReason): RefusalReason {
  return isInternal(reason) ? "github-error" : reason;
}

interface Refusal {
  readonly reason: FailureReason;
  readonly until: number | null;
  readonly status: number | null;
}

export class VaultFailure extends Error {
  readonly reason: FailureReason;
  readonly until: number | null;
  readonly status: number | null;

  constructor({ reason, until, status }: Refusal) {
    super(reason);
    this.reason = reason;
    this.until = until;
    this.status = status;
  }
}

export function vaultFailure(reason: FailureReason): VaultFailure {
  return new VaultFailure({ reason, until: null, status: null });
}
