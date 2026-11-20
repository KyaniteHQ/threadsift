import type { ZodType } from "zod";

import { BUDGET_SPENT, type Scope } from "../core/agent-token-contract.ts";
import { BudgetRefusalSchema, ErrorResponseSchema } from "./schemas.ts";

export const PASTE_DIGEST_SCOPE = " A body with a `digest` needs the `digest` scope as well.";

export function codeList(words: readonly string[]): string {
  const quoted = words.map((word) => `\`${word}\``);
  const last = quoted.at(-1);

  return quoted.length < 2
    ? quoted.join("")
    : `${quoted.slice(0, -1).join(", ")} and ${String(last)}`;
}

export function jsonBody<T extends ZodType>(schema: T, description: string) {
  return { description, content: { "application/json": { schema } } };
}

export function jsonRequest<T extends ZodType>(schema: T) {
  return { required: true, content: { "application/json": { schema } } };
}

export const noContent = (description: string) => ({ description });

export function scopeNote({ who }: Readonly<{ who: Scope }>, extra = ""): string {
  return ` An agent token needs the \`${who}\` scope.${extra}`;
}

export function scopeRefusal({ who }: Readonly<{ who: Scope }>, extra = "") {
  return {
    403: jsonBody(ErrorResponseSchema, `The agent token lacks the \`${who}\` scope.${extra}`),
  };
}

export const OWNER_SESSION_REFUSALS = {
  401: jsonBody(ErrorResponseSchema, "No owner session."),
  403: jsonBody(ErrorResponseSchema, "An agent token called this."),
};

export function budgetRefusal(whatIsSaved: string) {
  return {
    429: jsonBody(
      BudgetRefusalSchema,
      `The agent token has added its daily budget of Items. ${whatIsSaved} \`code\` is \`${BUDGET_SPENT}\`, and \`Retry-After\` gives the seconds until 00:00 UTC, when the budget starts again. A link the library already holds is not counted and is still answered. The owner's session has no budget.`,
    ),
  };
}
