import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import {
  X_READER_NOT_OFFERED,
  XReaderInputSchema,
  XSettingsViewSchema,
} from "../../../core/contract/x-settings-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { jsonBody, jsonRequest, accessNote, accessRefusals } from "../../../http/openapi.ts";
import { chooseXReader, readXSettings } from "../core/x-settings.ts";

const OWNER = access("owner");

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/x",
  middleware: OWNER,
  description: accessNote(OWNER),
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      XSettingsViewSchema,
      "Which reader the owner chose for X links (`reader`: `auto`, `grok-bot` or `grok-cli`), the choices this install offers (`choices`; the Worker has no grok CLI and offers `auto` and `grok-bot` only), the state of the Grok Bot (`bot`: `ready`, `not-configured`, `secret-missing` or `refused`), and the grok CLI: its id (`fetcher`, null on the Worker and on a container without the CLI), its state and the version it reported. With `auto`, a ready Grok Bot reads X links, otherwise the grok CLI, otherwise the link stays Link-only. The CLI state is a hint read from the CLI, never a credential.",
    ),
  },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/x",
  middleware: OWNER,
  description: accessNote(OWNER),
  request: { body: jsonRequest(XReaderInputSchema) },
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      XSettingsViewSchema,
      "The settings after the change. The chosen reader alone reads an X link; when it cannot be used, the Item stays Link-only with a note that names the cause, and the other reader is not tried. A Paste that carries the thread as `content` ignores the choice. The change applies to fetches that start after it.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "`reader` is `grok-cli` on the Worker, which has no grok CLI. Nothing is saved.",
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
