import { DailyBudgetSchema } from "../../src/core/kinds.ts";

export type BudgetInput =
  | { readonly kind: "none" }
  | { readonly kind: "limit"; readonly limit: number }
  | { readonly kind: "invalid" };

const DIGITS = /^\d+$/u;

export function parseBudget(text: string): BudgetInput {
  const trimmed = text.trim();

  if (trimmed === "") return { kind: "none" };

  const limit = DailyBudgetSchema.safeParse(DIGITS.test(trimmed) ? Number(trimmed) : null);

  return limit.success && limit.data !== null
    ? { kind: "limit", limit: limit.data }
    : { kind: "invalid" };
}

export function dailyBudgetOf(input: Exclude<BudgetInput, { kind: "invalid" }>): number | null {
  return input.kind === "none" ? null : input.limit;
}

export type BudgetFlow =
  | { readonly kind: "idle"; readonly focus: number | null }
  | { readonly kind: "editing"; readonly id: number }
  | { readonly kind: "saving"; readonly id: number; readonly request: number }
  | { readonly kind: "failed"; readonly id: number };

export type BudgetEvent =
  | { readonly kind: "edit"; readonly id: number }
  | { readonly kind: "cancel"; readonly id: number }
  | { readonly kind: "begin"; readonly id: number; readonly request: number }
  | { readonly kind: "refuse"; readonly id: number; readonly request: number }
  | { readonly kind: "saved"; readonly id: number; readonly request: number };

export const BUDGET_START: BudgetFlow = { kind: "idle", focus: null };

export type RowBudget = "idle" | "editing" | "saving" | "failed";

export function rowBudget(flow: Readonly<BudgetFlow>, id: number): RowBudget {
  return flow.kind === "idle" || flow.id !== id ? "idle" : flow.kind;
}

function isSaving(flow: Readonly<BudgetFlow>, id: number, request: number): boolean {
  return flow.kind === "saving" && flow.id === id && flow.request === request;
}

export function reduceBudget(flow: BudgetFlow, event: BudgetEvent): BudgetFlow {
  switch (event.kind) {
    case "edit":
      return flow.kind === "saving" ? flow : { kind: "editing", id: event.id };
    case "cancel":
      return flow.kind === "saving" ? flow : { kind: "idle", focus: event.id };
    case "begin":
      return (flow.kind === "editing" || flow.kind === "failed") && flow.id === event.id
        ? { kind: "saving", id: event.id, request: event.request }
        : flow;
    case "refuse":
      return isSaving(flow, event.id, event.request) ? { kind: "failed", id: event.id } : flow;
    case "saved":
      return isSaving(flow, event.id, event.request) ? { kind: "idle", focus: event.id } : flow;
    default: {
      const exhaustive: never = event;

      return exhaustive;
    }
  }
}
