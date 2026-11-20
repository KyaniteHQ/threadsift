import { createRoute } from "@hono/zod-openapi";

import {
  ChangeBudgetRequestSchema,
  ChangePasswordRequestSchema,
  CreateTokenRequestSchema,
  CreatedTokenResponseSchema,
  LoginRequestSchema,
  ResetPasswordRequestSchema,
  SessionStateSchema,
  SetupCodeRequestSchema,
  SetupRequestSchema,
  TOKEN_NAME_MAX,
  TokenListResponseSchema,
  TokenSummaryResponseSchema,
} from "../../../core/contract/access-wire.ts";
import {
  DEFAULT_SCOPES,
  DEFAULT_TOKEN_BUDGET,
  SCOPES,
} from "../../../core/contract/agent-token-contract.ts";
import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import { access } from "../../../http/access.ts";
import { codeList, jsonBody, jsonRequest, noContent } from "../../../http/openapi.ts";
import { PASSWORD_RULE } from "../../../http/refusals.ts";
import { ID_REFUSAL, IdParamSchema } from "../../../http/route-input.ts";

const errorBody = (description: string) => jsonBody(ErrorResponseSchema, description);

const TOO_MANY = errorBody("Too many wrong tries; `Retry-After` gives the seconds to wait.");

const ORIGIN_REFUSAL = "A 403 with no `code` refuses the request's origin or content type.";

const SETUP_ERRORS = {
  403: errorBody(`The setup code is wrong; \`code\` is \`wrong-setup-code\`. ${ORIGIN_REFUSAL}`),
  409: errorBody("An owner exists already."),
  429: TOO_MANY,
  503: errorBody("The Instance has no usable setup code; `code` says why."),
};

export const sessionRoute = createRoute({
  method: "get",
  path: "/api/session",
  middleware: access("anyone"),
  responses: {
    200: jsonBody(
      SessionStateSchema,
      "`setup` while no owner exists, with `code` saying whether the Instance has a usable setup code (`set`, `missing` or `short`), else `signed-in` or `signed-out`.",
    ),
  },
});

export const setupCodeRoute = createRoute({
  method: "post",
  path: "/api/setup/code",
  middleware: access("anyone"),
  request: { body: jsonRequest(SetupCodeRequestSchema) },
  responses: { 204: noContent("The setup code is right."), ...SETUP_ERRORS },
});

export const setupRoute = createRoute({
  method: "post",
  path: "/api/setup",
  middleware: access("anyone"),
  request: { body: jsonRequest(SetupRequestSchema) },
  responses: {
    204: noContent("The owner exists and the response sets the session cookie."),
    400: errorBody(PASSWORD_RULE),
    ...SETUP_ERRORS,
    409: errorBody(
      "An owner exists already, or the password changed while the call ran and no session started; `code` says which.",
    ),
  },
});

export const loginRoute = createRoute({
  method: "post",
  path: "/api/login",
  middleware: access("anyone"),
  request: { body: jsonRequest(LoginRequestSchema) },
  responses: {
    204: noContent("The password is right and the response sets the session cookie."),
    403: errorBody(`The password is wrong; \`code\` is \`wrong-password\`. ${ORIGIN_REFUSAL}`),
    409: errorBody("The password changed while this call ran, so nothing was done."),
    429: TOO_MANY,
  },
});

export const changePasswordRoute = createRoute({
  method: "post",
  path: "/api/password",
  middleware: access("owner"),
  request: { body: jsonRequest(ChangePasswordRequestSchema) },
  responses: {
    204: noContent(
      "The password is changed, every session ended and the response sets this caller a new session cookie. Agent tokens keep working.",
    ),
    400: errorBody(PASSWORD_RULE),
    401: errorBody("The session is missing, expired or revoked."),
    403: errorBody(
      `The current password is wrong and \`code\` is \`wrong-current-password\`, or an agent token was sent and the answer has no \`code\`. ${ORIGIN_REFUSAL}`,
    ),
    409: errorBody(
      "The password or this session changed while the call ran, so nothing was changed.",
    ),
    429: TOO_MANY,
  },
});

export const resetPasswordRoute = createRoute({
  method: "post",
  path: "/api/password/reset",
  middleware: access("anyone"),
  request: { body: jsonRequest(ResetPasswordRequestSchema) },
  responses: {
    204: noContent(
      "The password is set, the code is spent and every session ended. The response sets no cookie and agent tokens keep working.",
    ),
    400: errorBody(PASSWORD_RULE),
    403: errorBody(`The reset code is wrong; \`code\` is \`wrong-reset-code\`. ${ORIGIN_REFUSAL}`),
    409: errorBody(
      "The code was used already, the Instance has no owner, or the password changed while the call ran; `code` says which.",
    ),
    429: TOO_MANY,
    503: errorBody("The Instance has no usable reset code; `code` says why."),
  },
});

export const logoutRoute = createRoute({
  method: "post",
  path: "/api/logout",
  middleware: access("owner"),
  responses: { 204: noContent("The session is deleted and the cookie cleared.") },
});

export const createTokenRoute = createRoute({
  method: "post",
  path: "/api/tokens",
  middleware: access("owner"),
  request: { body: jsonRequest(CreateTokenRequestSchema) },
  responses: {
    201: jsonBody(
      CreatedTokenResponseSchema,
      `The token, with the \`scopes\` it holds and its \`budget\`, and its value, which is never shown again. \`scopes\` in the request defaults to ${codeList(DEFAULT_SCOPES)}. \`dailyBudget\` is the number of new Items the token may add each UTC day; it defaults to ${String(DEFAULT_TOKEN_BUDGET)} and \`null\` means no budget.`,
    ),
    400: errorBody(
      `\`name\` is empty or longer than ${String(TOKEN_NAME_MAX)} characters, \`scopes\` is empty or names something other than ${codeList(SCOPES)}, or \`dailyBudget\` is not a whole number above 0 or null.`,
    ),
  },
});

export const listTokensRoute = createRoute({
  method: "get",
  path: "/api/tokens",
  middleware: access("owner"),
  responses: {
    200: jsonBody(
      TokenListResponseSchema,
      "Every token with its `scopes` and its `budget`, newest first, without its value. `budget` is `unlimited` with the Items added today, `within` with the `limit`, the Items added today and how many are `left`, or `spent` with the `limit` and the time in milliseconds when the budget starts again.",
    ),
  },
});

export const revokeTokenRoute = createRoute({
  method: "delete",
  path: "/api/tokens/{id}",
  middleware: access("owner"),
  request: { params: IdParamSchema },
  responses: {
    ...ID_REFUSAL,
    204: noContent("The token is revoked and its next use gets 401."),
    404: errorBody("No such token."),
  },
});

export const changeBudgetRoute = createRoute({
  method: "patch",
  path: "/api/tokens/{id}",
  middleware: access("owner"),
  request: { params: IdParamSchema, body: jsonRequest(ChangeBudgetRequestSchema) },
  responses: {
    200: jsonBody(
      TokenSummaryResponseSchema,
      "The token with its new `budget`. A budget lower than the Items added today leaves the token spent until 00:00 UTC.",
    ),
    400: errorBody("`dailyBudget` is missing, or not a whole number above 0 or null."),
    404: errorBody("No such token."),
  },
});
