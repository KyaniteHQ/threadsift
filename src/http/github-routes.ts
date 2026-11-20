import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import {
  GithubSaveResponseSchema,
  GithubSettingsViewSchema,
  GithubTokenInputSchema,
  GithubVerifyResultSchema,
} from "../core/contract/github-contract.ts";
import {
  readGithubSettings,
  removeGithubToken,
  saveGithubToken,
  verifyGithubToken,
} from "../core/github/github-token.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { access } from "./access.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/github",
  middleware: access("owner"),
  responses: {
    200: jsonBody(
      GithubSettingsViewSchema,
      "Whether a GitHub token is saved, missing or unreadable, and whether this Instance has a usable sealing key. No token is returned.",
    ),
  },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/github",
  middleware: access("owner"),
  request: { body: jsonRequest(GithubTokenInputSchema) },
  responses: {
    200: jsonBody(
      GithubSaveResponseSchema,
      "The settings after the token is saved or replaced, or a safe refusal when the Instance has no usable sealing key. A saved token that cannot be read does not block a replacement.",
    ),
  },
});

const removeRoute = createRoute({
  method: "delete",
  path: "/api/settings/github",
  middleware: access("owner"),
  responses: {
    200: jsonBody(
      GithubSettingsViewSchema,
      "The settings after the token is removed. Removing when none is saved, or when the saved one is unreadable, also succeeds.",
    ),
  },
});

const verifyRoute = createRoute({
  method: "post",
  path: "/api/settings/github/verify",
  middleware: access("owner"),
  responses: {
    200: jsonBody(
      GithubVerifyResultSchema,
      "The hourly limit and what is left, or a safe refusal. GitHub's own 401 is a refusal inside this 200, so it never signs the owner out.",
    ),
  },
});

export function registerGithubRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(readRoute, async (c) => c.json(await readGithubSettings(ports), 200));
  app.openapi(saveRoute, async (c) =>
    c.json(await saveGithubToken(ports, c.req.valid("json")), 200),
  );
  app.openapi(removeRoute, async (c) => c.json(await removeGithubToken(ports), 200));
  app.openapi(verifyRoute, async (c) =>
    c.json(await verifyGithubToken(ports, c.req.raw.signal), 200),
  );
}
