import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import {
  VaultVerifyInputSchema,
  VaultInputSchema,
  VaultResultSchema,
  VaultViewSchema,
} from "../core/vault-contract.ts";
import {
  readVaultSettings,
  removeVaultSettings,
  saveVaultSettings,
  verifyVaultSettings,
} from "../core/vault-settings.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";

const read = createRoute({
  method: "get",
  path: "/api/settings/obsidian",
  responses: {
    200: jsonBody(
      VaultViewSchema,
      "Vault target and its configuration state. No token is returned.",
    ),
  },
});
const save = createRoute({
  method: "put",
  path: "/api/settings/obsidian",
  request: { body: jsonRequest(VaultInputSchema) },
  responses: { 200: jsonBody(VaultResultSchema, "Save a vault target and queue the library.") },
});
const remove = createRoute({
  method: "delete",
  path: "/api/settings/obsidian",
  responses: {
    200: jsonBody(VaultResultSchema, "Disconnect the vault without deleting its files."),
  },
});
const verify = createRoute({
  method: "post",
  path: "/api/settings/obsidian/verify",
  request: { body: jsonRequest(VaultVerifyInputSchema) },
  responses: {
    200: jsonBody(
      VaultResultSchema,
      "Check if a branch is reachable or a mounted folder is writable. Saves no setting.",
    ),
  },
});

export function registerVaultRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(read, async (c) => c.json(await readVaultSettings(ports), 200));
  app.openapi(save, async (c) => c.json(await saveVaultSettings(ports, c.req.valid("json")), 200));
  app.openapi(remove, async (c) => c.json(await removeVaultSettings(ports), 200));
  app.openapi(verify, async (c) =>
    c.json(await verifyVaultSettings(ports, c.req.valid("json"), c.req.raw.signal), 200),
  );
}
