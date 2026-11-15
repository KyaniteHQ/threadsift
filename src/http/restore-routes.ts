import { type OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { RESTORE_PART_BYTES } from "../core/limits.ts";
import type { Ports } from "../core/ports.ts";
import {
  NewRestoreSchema,
  RestoreErrorSchema,
  RestoreStatusSchema,
  StartedRestoreSchema,
} from "../core/restore-contract.ts";
import { createRestore, storePart } from "../core/restore-run.ts";
import { startRestore } from "../core/restore-start.ts";
import { restoreStatus } from "../core/restore-state.ts";
import { jsonBody, jsonRequest, noContent } from "./openapi.ts";
import { ErrorResponseSchema, IdParamSchema } from "./schemas.ts";

const PartParamsSchema = IdParamSchema.extend({ part: z.coerce.number().int().positive() });

const OWNER_ONLY =
  " Only the owner's session may call this; an agent token gets 403, because a leaked token must not write a whole library.";

const LIBRARY_NOT_EMPTY =
  "The library holds Items, Topics, Tags, Log entries, Proposals, Pins or Import cursors, so nothing can be restored into it.";

const OPEN = "Another restore is waiting for its upload or is running.";

const createRestoreRoute = createRoute({
  method: "post",
  path: "/api/restore",
  request: { body: jsonRequest(NewRestoreSchema) },
  responses: {
    201: jsonBody(
      StartedRestoreSchema,
      `A restore is waiting for its upload. Cut the zip into parts of \`partBytes\` (the last part holds the rest) and send each with \`PUT /api/restore/{id}/parts/{n}\`. \`bytes\` is at most 50 GB, and \`parts\` is \`bytes\` divided by \`partBytes\`, rounded up.${OWNER_ONLY}`,
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "`parts` is not `bytes` divided by `partBytes`, rounded up.",
    ),
    401: jsonBody(ErrorResponseSchema, "No owner session."),
    403: jsonBody(ErrorResponseSchema, "An agent token called this."),
    409: jsonBody(
      RestoreErrorSchema,
      `\`code\` is \`library-not-empty\`: ${LIBRARY_NOT_EMPTY} Or \`restore-open\`: ${OPEN}`,
    ),
  },
});

const statusRoute = createRoute({
  method: "get",
  path: "/api/restore",
  responses: {
    200: jsonBody(
      RestoreStatusSchema,
      `The newest restore, or \`{ "state": "none" }\`. \`libraryEmpty\` says whether a restore can start. \`uploading\` lists the \`received\` parts, so a client that reloaded sends the missing ones. \`running\` carries the \`phase\` (\`check\`, \`tables\` or \`finish\`) and the rows \`restored\` and \`dropped\` for each table, where a dropped row had no parent row in the zip or repeated the key of an earlier row. \`done\` carries the same counts. \`failed\` carries a \`failure\` word: a refusal code of the check (\`not-a-zip\`, \`unsupported-compression\`, \`bad-entry-name\`, \`no-manifest\`, \`format\`, \`newer-release\`, \`unknown-table\`, \`unknown-column\`, \`missing-column\` or \`crc\`), or \`gave-up\` (a unit failed 3 times).${OWNER_ONLY}`,
    ),
    401: jsonBody(ErrorResponseSchema, "No owner session."),
    403: jsonBody(ErrorResponseSchema, "An agent token called this."),
  },
});

const partRoute = createRoute({
  method: "put",
  path: "/api/restore/{id}/parts/{part}",
  request: {
    params: PartParamsSchema,
    body: {
      required: true,
      content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } },
    },
  },
  responses: {
    204: noContent(
      `The part is stored. Sending a part again replaces it, so a repeat is safe. The body must be exactly \`partBytes\` (${String(RESTORE_PART_BYTES)}) bytes, except the last part, which holds the rest.${OWNER_ONLY}`,
    ),
    400: jsonBody(ErrorResponseSchema, "The body is not the length this part must have."),
    401: jsonBody(ErrorResponseSchema, "No owner session."),
    403: jsonBody(ErrorResponseSchema, "An agent token called this."),
    404: jsonBody(ErrorResponseSchema, "No restore has this id, or it has no such part."),
    409: jsonBody(ErrorResponseSchema, "The restore is no longer waiting for its upload."),
    413: jsonBody(ErrorResponseSchema, "The body is longer than `partBytes`."),
  },
});

const startRoute = createRoute({
  method: "post",
  path: "/api/restore/{id}/start",
  request: { params: IdParamSchema },
  responses: {
    202: jsonBody(
      StartedRestoreSchema.pick({ id: true }),
      `The restore was waiting for its start, the library is still empty and every part has arrived, so it is \`running\` in its \`check\` phase. Jobs check the whole zip first (a refusal shows in \`GET /api/restore\` as \`failed\` with a \`failure\` code, deletes the parts and writes nothing to the library), then restore the tables in foreign key order, one bounded unit after another, keep the ids of the zip, and then set each table's id counter and the version of each data step. \`POST /api/items\` and \`POST /api/items/batch\` answer 503 while it runs.${OWNER_ONLY}`,
    ),
    400: jsonBody(
      RestoreErrorSchema,
      "`code` is `incomplete-upload`: a part has not arrived, and the restore keeps its parts.",
    ),
    401: jsonBody(ErrorResponseSchema, "No owner session."),
    403: jsonBody(ErrorResponseSchema, "An agent token called this."),
    404: jsonBody(ErrorResponseSchema, "No restore has this id."),
    409: jsonBody(
      RestoreErrorSchema,
      `\`library-not-empty\`: ${LIBRARY_NOT_EMPTY} Or \`restore-open\`: the restore is not waiting for its start.`,
    ),
  },
});

function registerUploadRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(createRestoreRoute, async (c) => {
    const created = await createRestore(ports.db, c.req.valid("json"));

    switch (created.kind) {
      case "created":
        return c.json({ id: created.id, partBytes: created.partBytes }, 201);
      case "wrong-parts":
        return c.json({ error: "parts is not bytes divided by the part size, rounded up" }, 400);
      case "library-not-empty":
        return c.json({ error: LIBRARY_NOT_EMPTY, code: "library-not-empty" as const }, 409);
      case "restore-open":
        return c.json({ error: OPEN, code: "restore-open" as const }, 409);
      default:
        return created satisfies never;
    }
  });

  app.openapi(partRoute, async (c) => {
    const { id, part } = c.req.valid("param");

    const stored = await storePart(ports, {
      id,
      part,
      bytes: new Uint8Array(await c.req.arrayBuffer()),
    });

    switch (stored.kind) {
      case "stored":
        return c.body(null, 204);
      case "missing":
        return c.json({ error: "Not found" }, 404);
      case "not-uploading":
        return c.json({ error: "The restore is no longer waiting for its upload" }, 409);
      case "wrong-length":
        return c.json({ error: "The body is not the length this part must have" }, 400);
      default:
        return stored satisfies never;
    }
  });
}

function registerRunRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(statusRoute, async (c) => c.json(await restoreStatus(ports), 200));

  app.openapi(startRoute, async (c) => {
    const { id } = c.req.valid("param");
    const started = await startRestore(ports, id);

    switch (started.kind) {
      case "started":
        return c.json({ id }, 202);
      case "missing":
        return c.json({ error: "Not found" }, 404);
      case "not-uploading":
        return c.json(
          { error: "The restore is not waiting for its start", code: "restore-open" as const },
          409,
        );
      case "library-not-empty":
        return c.json({ error: LIBRARY_NOT_EMPTY, code: "library-not-empty" as const }, 409);
      case "incomplete-upload":
        return c.json(
          { error: "Some parts of the upload have not arrived", code: started.kind },
          400,
        );
      default:
        return started satisfies never;
    }
  });
}

export function registerRestoreRoutes(app: OpenAPIHono, ports: Ports): void {
  registerUploadRoutes(app, ports);
  registerRunRoutes(app, ports);
}
