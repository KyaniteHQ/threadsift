import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import {
  AiSettingsInputSchema,
  AiSettingsViewSchema,
  VerifyResultSchema,
} from "../core/ai-contract.ts";
import { readAiSettings, saveAiSettings } from "../core/ai-settings.ts";
import { verifyAi } from "../core/ai-tasks.ts";
import type { Ports } from "../core/ports.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";

const MutationResponse = z.union([AiSettingsViewSchema, VerifyResultSchema]);

const responses = {
  200: jsonBody(MutationResponse, "Settings or a safe refusal category. No secret is returned."),
};

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/ai",
  responses: { 200: jsonBody(AiSettingsViewSchema, "Provider settings and whether a key is set.") },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/ai",
  request: { body: jsonRequest(AiSettingsInputSchema) },
  responses,
});

const verifyRoute = createRoute({
  method: "post",
  path: "/api/settings/ai/verify",
  responses: {
    200: jsonBody(VerifyResultSchema, "The verified Digest or a safe refusal category."),
  },
});

export function registerAiRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(readRoute, async (c) => c.json(await readAiSettings(ports), 200));
  app.openapi(saveRoute, async (c) => {
    const reason = await saveAiSettings(ports, c.req.valid("json"));

    return c.json(
      reason === null
        ? await readAiSettings(ports)
        : { kind: "refused" as const, reason, status: null },
      200,
    );
  });
  app.openapi(verifyRoute, async (c) => {
    const result = await verifyAi(ports, c.req.raw.signal);

    return c.json(result, 200);
  });
}
