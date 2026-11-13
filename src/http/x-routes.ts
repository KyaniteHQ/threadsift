import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import {
  X_READER_NOT_OFFERED,
  XReaderInputSchema,
  XSettingsViewSchema,
  chooseXReader,
  readXSettings,
} from "../core/x-settings.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/x",
  responses: {
    200: jsonBody(
      XSettingsViewSchema,
      "Which reader the owner chose for X links (`reader`: `auto`, `grok-bot` or `grok-cli`), the choices this install offers (`choices`; the Worker has no grok CLI and offers `auto` and `grok-bot` only), the state of the Grok Bot (`bot`: `ready`, `not-configured`, `secret-missing` or `refused`), and the grok CLI: its id (`fetcher`, null on the Worker and on a container without the CLI), its state and the version it reported. With `auto`, a ready Grok Bot reads X links, otherwise the grok CLI, otherwise the link stays Link-only. The CLI state is a hint read from the CLI, never a credential.",
    ),
  },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/x",
  request: { body: jsonRequest(XReaderInputSchema) },
  responses: {
    200: jsonBody(
      XSettingsViewSchema,
      "The settings after the change. The chosen reader alone reads an X link; when it cannot be used, the Item stays Link-only with a note that names the cause, and the other reader is not tried. A Paste that carries the thread as `content` ignores the choice. The change applies to fetches that start after it.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "`reader` is not `auto`, `grok-bot` or `grok-cli`, or it is `grok-cli` on the Worker, which has no grok CLI. Nothing is saved.",
    ),
  },
});

export function registerXRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(readRoute, async (c) => c.json(await readXSettings(ports), 200));
  app.openapi(saveRoute, async (c) => {
    const view = await chooseXReader(ports, c.req.valid("json").reader);

    return view === null ? c.json({ error: X_READER_NOT_OFFERED }, 400) : c.json(view, 200);
  });
}
