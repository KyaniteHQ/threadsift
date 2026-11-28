import type { ZodType } from "zod";

import { BUDGET_SPENT, type Scope } from "../core/contract/agent-token-contract.ts";
import { ErrorResponseSchema, UnavailableResponseSchema } from "../core/contract/error-wire.ts";
import { RESTORING_CODE } from "../core/contract/restore-contract.ts";
import { CHALLENGES } from "./bearer.ts";
import { type CacheKind, cacheHeaders } from "./response-headers.ts";

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

interface Gated {
  readonly who: "owner" | Scope;
}

export function accessNote({ who }: Readonly<Gated>, extra = ""): string {
  return who === "owner"
    ? `Only the owner's session may call this; an agent token gets 403.${extra}`
    : `An agent token needs the \`${who}\` scope.${extra}`;
}

export function accessRefusals({ who }: Readonly<Gated>, extra = "") {
  return {
    401: jsonBody(
      ErrorResponseSchema,
      `The request has no owner session and no agent token, its \`Authorization\` header is not a bearer credential, or the agent token is unknown or revoked. \`WWW-Authenticate\` is \`${CHALLENGES.missing}\`, and \`${CHALLENGES.unknown}\` when the agent token is unknown or revoked.`,
    ),
    403: jsonBody(
      ErrorResponseSchema,
      who === "owner"
        ? `An agent token called this.${extra}`
        : `The agent token lacks the \`${who}\` scope.${extra}`,
    ),
  };
}

export function cacheHeaderList(kind: CacheKind): string {
  return codeList(Object.entries(cacheHeaders(kind)).map(([name, value]) => `${name}: ${value}`));
}

export function budgetRefusal<Schema extends ZodType>(whatIsSaved: string, schema: Schema) {
  return {
    429: jsonBody(
      schema,
      `The agent token has added its daily budget of Items. ${whatIsSaved} \`code\` is \`${BUDGET_SPENT}\`, and \`Retry-After\` gives the seconds until 00:00 UTC, when the budget starts again. A link the library already holds is not counted and is still answered. The owner's session has no budget.`,
    ),
  };
}

export function restoringResponse(whatIsSaved: string) {
  return jsonBody(
    UnavailableResponseSchema,
    `A restore holds the library (\`code\` is \`${RESTORING_CODE}\`), so ${whatIsSaved} Reads and deletes work meanwhile. Send the request again when the restore has finished.`,
  );
}
