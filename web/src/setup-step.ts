import type { SetupCodeProblem } from "../../src/core/setup-code.ts";

export type SetupStep =
  | { readonly name: "code" | "code-wrong" }
  | { readonly name: "password"; readonly code: string }
  | { readonly name: "unavailable"; readonly reason: SetupCodeProblem };

export type GoTo = (step: SetupStep) => void;
