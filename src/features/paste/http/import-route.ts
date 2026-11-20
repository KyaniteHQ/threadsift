import { type OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import {
  IMPORT_NAME_MAX,
  ImportNameSchema,
  ImportStateSchema,
} from "../../../core/contract/import-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { jsonBody } from "../../../http/openapi.ts";
import { readImport } from "../core/import-cursor.ts";

const NO_IMPORT = "No cursor is saved under this name";

const getImportRoute = createRoute({
  method: "get",
  path: "/api/imports/{name}",
  middleware: access("read"),
  request: {
    params: z.object({ name: ImportNameSchema }),
  },
  responses: {
    200: jsonBody(
      ImportStateSchema,
      "The cursor the last batch call saved under this name, and when it saved it in milliseconds.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `\`name\` is not 1 to ${String(IMPORT_NAME_MAX)} letters, digits, \`.\`, \`_\` and \`-\`.`,
    ),
    404: jsonBody(ErrorResponseSchema, "No batch call saved a cursor under this name."),
  },
});

export function registerImportRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(getImportRoute, async (c) => {
    const found = await readImport(ports.db, c.req.valid("param").name);

    return found === undefined ? c.json({ error: NO_IMPORT }, 404) : c.json(found, 200);
  });
}
