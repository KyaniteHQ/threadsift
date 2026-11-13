import type { ZodType } from "zod";

import { requiredScope } from "./access-rules.ts";
import { BudgetRefusalSchema, ErrorResponseSchema } from "./schemas.ts";

export const PASTE_DIGEST_SCOPE = " A body with a `digest` needs the `digest` scope as well.";

export function jsonBody<T extends ZodType>(schema: T, description: string) {
  return { description, content: { "application/json": { schema } } };
}

export function jsonRequest<T extends ZodType>(schema: T) {
  return { required: true, content: { "application/json": { schema } } };
}

export const noContent = (description: string) => ({ description });

function scopeOf(method: string, path: string): string {
  const scope = requiredScope(method, path);

  if (scope === undefined) {
    throw new Error(`${method} ${path} has no scope`);
  }

  return scope;
}

export function scopeNote(method: string, path: string, extra = ""): string {
  return ` An agent token needs the \`${scopeOf(method, path)}\` scope.${extra}`;
}

export function scopeRefusal(method: string, path: string, extra = "") {
  return {
    403: jsonBody(
      ErrorResponseSchema,
      `The agent token lacks the \`${scopeOf(method, path)}\` scope.${extra}`,
    ),
  };
}

export const budgetRefusal = {
  429: jsonBody(
    BudgetRefusalSchema,
    "The agent token has added its daily budget of Items. Nothing is saved, `code` is `budget-spent`, and `Retry-After` gives the seconds until 00:00 UTC, when the budget starts again. A link the library already holds is not counted and is still answered. The owner's session has no budget.",
  ),
};
