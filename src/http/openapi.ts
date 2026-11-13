import type { ZodType } from "zod";

import { requiredScope } from "./access-rules.ts";
import { ErrorResponseSchema } from "./schemas.ts";

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
