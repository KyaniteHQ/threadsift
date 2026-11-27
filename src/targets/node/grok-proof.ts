import type { XCliBar } from "../../core/contract/x-settings-contract.ts";
import { type Refused, SURFACE_REFUSAL, refusalOf } from "./grok-answer.ts";
import type { BinaryIdentity } from "./grok-folders.ts";
import type { RunRecord } from "./grok-process.ts";
import { type ToolsVerdict, toolsVerdict } from "./grok-surface.ts";

export type Proof =
  | { readonly kind: "unproven" }
  | { readonly kind: "proven"; readonly binary: BinaryIdentity }
  | { readonly kind: "refused"; readonly binary: BinaryIdentity; readonly verdict: XCliBar };

export type PreflightResult =
  | { readonly kind: "judged"; readonly verdict: "proven" | XCliBar }
  | { readonly kind: "inconclusive" };

type Permission = "allowed" | "preflight" | "refused";

export const UNPROVEN: Proof = { kind: "unproven" };

export function sameBinary(
  first: Readonly<BinaryIdentity>,
  second: Readonly<BinaryIdentity> | null,
): boolean {
  return (
    second !== null &&
    first.path === second.path &&
    first.size === second.size &&
    first.modifiedMs === second.modifiedMs
  );
}

export function permission(proof: Readonly<Proof>, binary: Readonly<BinaryIdentity>): Permission {
  switch (proof.kind) {
    case "unproven":
      return "preflight";
    case "proven":
      return sameBinary(proof.binary, binary) ? "allowed" : "preflight";
    case "refused":
      return sameBinary(proof.binary, binary) ? "refused" : "preflight";
    default: {
      const exhaustive: never = proof;

      return exhaustive;
    }
  }
}

export function afterPreflight(
  binary: Readonly<BinaryIdentity>,
  result: Readonly<PreflightResult>,
): Proof {
  if (result.kind === "inconclusive") return UNPROVEN;

  if (result.verdict === "proven") return { kind: "proven", binary };

  return { kind: "refused", binary, verdict: result.verdict };
}

export function keptBar(
  current: Readonly<Proof>,
  binary: Readonly<BinaryIdentity>,
  next: Readonly<Proof>,
): Proof {
  return current.kind === "refused" && sameBinary(current.binary, binary) ? current : next;
}

export function afterRun(
  current: Readonly<Proof>,
  binary: Readonly<BinaryIdentity>,
  next: Readonly<Proof>,
): Proof {
  const ofAnotherBinary = current.kind !== "unproven" && !sameBinary(current.binary, binary);

  return ofAnotherBinary ? current : keptBar(current, binary, next);
}

export function preflightResultOf(verdict: ToolsVerdict | "probe-acted"): PreflightResult {
  return verdict === "tools-unreadable" ? { kind: "inconclusive" } : { kind: "judged", verdict };
}

type RunCheck =
  | { readonly kind: "surface-held" }
  | { readonly kind: "barred"; readonly verdict: "extra-tools" }
  | { readonly kind: "discard" | "reprove" | "keep"; readonly refusal: Refused };

export function exitedCleanly({ end }: Readonly<RunRecord>): boolean {
  return end.kind === "exited" && end.code === 0;
}

export function checkedRun(run: Readonly<RunRecord>): RunCheck {
  const verdict = toolsVerdict(run.tools);

  if (verdict === "proven") return { kind: "surface-held" };

  if (verdict === "extra-tools") return { kind: "barred", verdict };

  if (exitedCleanly(run)) return { kind: "discard", refusal: SURFACE_REFUSAL };

  const refusal = refusalOf(run.end);

  return { kind: run.tools.kind === "unreadable" ? "reprove" : "keep", refusal };
}
