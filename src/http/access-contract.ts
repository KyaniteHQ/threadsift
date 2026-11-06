import { createRoute } from "@hono/zod-openapi";

import { jsonBody, jsonRequest, noContent } from "./openapi.ts";
import { PASSWORD_RULE } from "./refusals.ts";
import {
  ChangePasswordRequestSchema,
  CreateTokenRequestSchema,
  CreatedTokenResponseSchema,
  ErrorResponseSchema,
  LoginRequestSchema,
  ResetPasswordRequestSchema,
  SessionStateSchema,
  SetupCodeRequestSchema,
  SetupRequestSchema,
  IdParamSchema,
  TokenListResponseSchema,
} from "./schemas.ts";

const errorBody = (description: string) => jsonBody(ErrorResponseSchema, description);

const TOO_MANY = errorBody("Too many wrong tries; `Retry-After` gives the seconds to wait.");

const SETUP_ERRORS = {
  401: errorBody("The setup code is wrong."),
  409: errorBody("An owner exists already."),
  429: TOO_MANY,
  503: errorBody("The Instance has no usable setup code; `code` says why."),
};

export const sessionRoute = createRoute({
  method: "get",
  path: "/api/session",
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
  request: { body: jsonRequest(SetupCodeRequestSchema) },
  responses: { 204: noContent("The setup code is right."), ...SETUP_ERRORS },
});

export const setupRoute = createRoute({
  method: "post",
  path: "/api/setup",
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
  request: { body: jsonRequest(LoginRequestSchema) },
  responses: {
    204: noContent("The password is right and the response sets the session cookie."),
    401: errorBody("The password is wrong."),
    409: errorBody("The password changed while this call ran, so nothing was done."),
    429: TOO_MANY,
  },
});

export const changePasswordRoute = createRoute({
  method: "post",
  path: "/api/password",
  request: { body: jsonRequest(ChangePasswordRequestSchema) },
  responses: {
    204: noContent(
      "The password is changed, every session ended and the response sets this caller a new session cookie. Agent tokens keep working.",
    ),
    400: errorBody(PASSWORD_RULE),
    401: errorBody("The session is missing, expired or revoked."),
    403: errorBody("The current password is wrong, or an agent token was sent."),
    409: errorBody(
      "The password or this session changed while the call ran, so nothing was changed.",
    ),
    429: TOO_MANY,
  },
});

export const resetPasswordRoute = createRoute({
  method: "post",
  path: "/api/password/reset",
  request: { body: jsonRequest(ResetPasswordRequestSchema) },
  responses: {
    204: noContent(
      "The password is set, the code is spent and every session ended. The response sets no cookie and agent tokens keep working.",
    ),
    400: errorBody(PASSWORD_RULE),
    403: errorBody("The reset code is wrong."),
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
  responses: { 204: noContent("The session is deleted and the cookie cleared.") },
});

export const createTokenRoute = createRoute({
  method: "post",
  path: "/api/tokens",
  request: { body: jsonRequest(CreateTokenRequestSchema) },
  responses: {
    201: jsonBody(
      CreatedTokenResponseSchema,
      "The token and its value, which is never shown again.",
    ),
  },
});

export const listTokensRoute = createRoute({
  method: "get",
  path: "/api/tokens",
  responses: {
    200: jsonBody(TokenListResponseSchema, "Every token, newest first, without its value."),
  },
});

export const revokeTokenRoute = createRoute({
  method: "delete",
  path: "/api/tokens/{id}",
  request: { params: IdParamSchema },
  responses: {
    204: noContent("The token is revoked and its next use gets 401."),
    404: errorBody("No such token."),
  },
});
