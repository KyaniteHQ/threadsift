import type { ProcessEnd } from "./cli-process.ts";
import { type Refused, SURFACE_REFUSAL, refusalOf } from "./grok-answer.ts";
import { type ToolList, type ToolsVerdict, toolsVerdict } from "./grok-surface.ts";

export interface BinaryIdentity {
  readonly path: string;
  readonly size: number;
  readonly modifiedMs: number;
}

export type Barred = "extra-tools" | "version-changed";

export type Proof =
  | { readonly kind: "unproven" }
  | { readonly kind: "proven"; readonly binary: BinaryIdentity }
  | {
      readonly kind: "refused";
      readonly binary: BinaryIdentity;
      readonly verdict: Barred;
      readonly version: string | null;
    };

export type PreflightResult =
  | {
      readonly kind: "judged";
      readonly verdict: "proven" | Barred;
      readonly version: string | null;
    }
  | { readonly kind: "inconclusive" };

export type Permission = "allowed" | "preflight" | "refused";

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

  return { kind: "refused", binary, verdict: result.verdict, version: result.version };
}

export function preflightResultOf(
  verdict: ToolsVerdict | "version-changed",
  version: string | null,
): PreflightResult {
  return verdict === "tools-unreadable"
    ? { kind: "inconclusive" }
    : { kind: "judged", verdict, version };
}

export interface RunRecord {
  readonly end: ProcessEnd;
  readonly tools: ToolList;
}

export type RunCheck =
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
