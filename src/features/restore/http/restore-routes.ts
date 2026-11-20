import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import { CanonicalNumberTextSchema } from "../../../core/contract/canonical-number.ts";
import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import { MAX_ATTEMPTS } from "../../../core/contract/job-contract.ts";
import {
  NewRestoreSchema,
  RESTORE_MAX_BYTES,
  RestoreErrorSchema,
  RestoreStatusSchema,
  StartedRestoreSchema,
  restoreAnswerSchema,
} from "../../../core/contract/restore-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access, PART_CAP } from "../../../http/access.ts";
import {
  accessNote,
  accessRefusals,
  jsonBody,
  jsonRequest,
  noContent,
} from "../../../http/openapi.ts";
import { notFound } from "../../../http/refusals.ts";
import { IdParamSchema } from "../../../http/route-input.ts";
import { cancelRestore } from "../core/restore-cancel.ts";
import { resumeRestore, startRestore } from "../core/restore-start.ts";
import { restoreStatus } from "../core/restore-state.ts";
import { createRestore, storePart } from "../core/restore-upload.ts";
import {
  FINISHED,
  LEAK,
  LIBRARY_NOT_EMPTY,
  NOT_RESUMABLE,
  OPEN,
  PARTS_GONE,
  PARTS_MISSING,
  PAST_UPLOAD,
  START_DESCRIPTION,
  STATUS_DESCRIPTION,
  SUPERSEDED,
  WRONG_PARTS,
} from "./restore-route-text.ts";

const PartParamsSchema = IdParamSchema.extend({ part: CanonicalNumberTextSchema });

const OWNER = access("owner");

const PART_OWNER = access("owner", { body: PART_CAP });

const createRestoreRoute = createRoute({
  method: "post",
  path: "/api/restore",
  middleware: OWNER,
  description: accessNote(OWNER, LEAK),
  request: { body: jsonRequest(NewRestoreSchema) },
  responses: {
    201: jsonBody(
      StartedRestoreSchema,
      `A restore is waiting for its upload. Cut the zip into parts of \`partBytes\` (the last part holds the rest) and send each with \`PUT /api/restore/{id}/parts/{n}\`. \`bytes\` is at most ${String(RESTORE_MAX_BYTES / 1_000_000_000)} GB, and \`parts\` is \`bytes\` divided by \`partBytes\`, rounded up.`,
    ),
    400: jsonBody(ErrorResponseSchema, WRONG_PARTS),
    ...accessRefusals(OWNER),
    409: jsonBody(
      restoreAnswerSchema("library-not-empty", "restore-open"),
      `\`code\` is \`library-not-empty\`: ${LIBRARY_NOT_EMPTY} The library is checked first, so a restore that is open and has already written records gives this code too. Or \`restore-open\`: ${OPEN} The library is still empty then, as it is for a restore that waits for its upload and for one that failed with \`gave-up\` before it wrote a record.`,
    ),
  },
});

const statusRoute = createRoute({
  method: "get",
  path: "/api/restore",
  middleware: OWNER,
  description: accessNote(OWNER, LEAK),
  responses: {
    200: jsonBody(RestoreStatusSchema, STATUS_DESCRIPTION),
    ...accessRefusals(OWNER),
  },
});

const partRoute = createRoute({
  method: "put",
  path: "/api/restore/{id}/parts/{part}",
  middleware: PART_OWNER,
  description: accessNote(PART_OWNER, LEAK),
  request: {
    params: PartParamsSchema,
    body: {
      required: true,
      content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } },
    },
  },
  responses: {
    204: noContent(
      `The part is stored. Sending a part again replaces it, so a repeat is safe. The body must be exactly \`partBytes\` (${String(PART_CAP.bytes)}) bytes, except the last part, which holds the rest.`,
    ),
    400: jsonBody(ErrorResponseSchema, "The body is not the length this part must have."),
    ...accessRefusals(PART_OWNER),
    404: jsonBody(ErrorResponseSchema, "No restore has this id, or it has no such part."),
    409: jsonBody(
      restoreAnswerSchema("not-uploading"),
      "`code` is `not-uploading`: the restore is past its upload when the call starts, so the part is not stored. A part that was accepted while the restore was uploading, and whose restore starts or fails before the part is written, is kept with a 204 when the restore is `running` or `failed` with `gave-up` and can be resumed, and is deleted with this 409 otherwise.",
    ),
    413: jsonBody(ErrorResponseSchema, "The limit is the `partBytes` of the restore."),
  },
});

const startRoute = createRoute({
  method: "post",
  path: "/api/restore/{id}/start",
  middleware: OWNER,
  description: accessNote(OWNER, LEAK),
  request: { params: IdParamSchema },
  responses: {
    202: jsonBody(StartedRestoreSchema.pick({ id: true }), START_DESCRIPTION),
    400: jsonBody(
      RestoreErrorSchema,
      "`code` is `incomplete-upload`: a part has not arrived, and the restore keeps its parts.",
    ),
    ...accessRefusals(OWNER),
    404: jsonBody(ErrorResponseSchema, "No restore has this id."),
    409: jsonBody(
      restoreAnswerSchema("library-not-empty", "not-uploading", "vault-busy"),
      `\`code\` is \`library-not-empty\`: ${LIBRARY_NOT_EMPTY} Or \`not-uploading\`: the restore is past its upload, because it is running, failed, cancelled or done. Or \`vault-busy\`: the Vault mirror holds a write lease. The uploaded parts stay available for retry.`,
    ),
  },
});

const cancelRoute = createRoute({
  method: "delete",
  path: "/api/restore/{id}",
  middleware: OWNER,
  description: accessNote(OWNER, LEAK),
  request: { params: IdParamSchema },
  responses: {
    202: jsonBody(
      StartedRestoreSchema.pick({ id: true }),
      `The restore was \`running\` or \`failed\` and had got past its \`check\` phase, so it is now \`cancelling\`, and jobs now delete every restored row, one bounded unit after another in the reverse of the table order, then every file under \`items/\`, and then the uploaded parts. \`GET /api/restore\` shows \`cancelled\` when the library is empty again. The ids the restore used are not reused. A restore that had written no library record answers 204 instead. A repeat while an undo runs answers 202 again. A cancel that fails ${String(MAX_ATTEMPTS)} times shows \`failed\` with \`cancelFailed\` true, and a cancel again continues it.`,
    ),
    204: noContent(
      `The restore is \`cancelled\` at once and has no library record to undo, because it was waiting for its upload, it had written no library record (a refusal of the check included), or it was cancelled before. Its parts are deleted and the library stays as it is. A new restore is accepted once the library is empty.`,
    ),
    ...accessRefusals(OWNER),
    404: jsonBody(ErrorResponseSchema, "No restore has this id."),
    409: jsonBody(
      restoreAnswerSchema("finished", "superseded"),
      "`code` is `finished`: the restore is done, so there is nothing to cancel. Or `superseded`: a newer restore exists, so only that one can be cancelled.",
    ),
  },
});

const resumeRoute = createRoute({
  method: "post",
  path: "/api/restore/{id}/resume",
  middleware: OWNER,
  description: accessNote(OWNER, LEAK),
  request: { params: IdParamSchema },
  responses: {
    202: jsonBody(
      StartedRestoreSchema.pick({ id: true }),
      `The restore had \`failed\` with \`gave-up\` (a unit failed ${String(MAX_ATTEMPTS)} times), so it is \`running\` again and a job continues from the cursor of its last committed unit. It ends \`done\` with the rows an uninterrupted run writes.`,
    ),
    400: jsonBody(
      RestoreErrorSchema,
      "`code` is `incomplete-upload`: a part of the zip is gone, so the restore cannot continue. Cancel it and upload the zip again.",
    ),
    ...accessRefusals(OWNER),
    404: jsonBody(ErrorResponseSchema, "No restore has this id."),
    409: jsonBody(
      restoreAnswerSchema("not-resumable", "superseded"),
      "`code` is `not-resumable`: the restore did not fail with `gave-up`, or its cancel is running. A refusal of the check cannot be resumed. Or `superseded`: a newer restore exists, so only that one can be resumed.",
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
        return notFound(c);
      case "not-uploading":
        return c.json(PAST_UPLOAD, 409);
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
        return notFound(c);
      case "not-uploading":
        return c.json(PAST_UPLOAD, 409);
      case "library-not-empty":
        return c.json({ error: LIBRARY_NOT_EMPTY, code: "library-not-empty" as const }, 409);
      case "vault-busy":
        return c.json({ error: "The Vault mirror holds a write lease", code: started.kind }, 409);
      case "incomplete-upload":
        return c.json(PARTS_MISSING, 400);
      default:
        return started satisfies never;
    }
  });
}

function registerCancelRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(cancelRoute, async (c) => {
    const { id } = c.req.valid("param");
    const cancelled = await cancelRestore(ports, id);

    switch (cancelled.kind) {
      case "cancelled":
        return c.body(null, 204);
      case "undoing":
        return c.json({ id }, 202);
      case "missing":
        return notFound(c);
      case "finished":
        return c.json(FINISHED, 409);
      case "superseded":
        return c.json(SUPERSEDED, 409);
      default:
        return cancelled satisfies never;
    }
  });
}

function registerResumeRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(resumeRoute, async (c) => {
    const { id } = c.req.valid("param");
    const resumed = await resumeRestore(ports, id);

    switch (resumed.kind) {
      case "resumed":
        return c.json({ id }, 202);
      case "missing":
        return notFound(c);
      case "not-resumable":
        return c.json(NOT_RESUMABLE, 409);
      case "superseded":
        return c.json(SUPERSEDED, 409);
      case "incomplete-upload":
        return c.json(PARTS_GONE, 400);
      default:
        return resumed satisfies never;
    }
  });
}

export function registerRestoreRoutes(app: OpenAPIHono, ports: Ports): void {
  registerUploadRoutes(app, ports);
  registerRunRoutes(app, ports);
  registerCancelRoute(app, ports);
  registerResumeRoute(app, ports);
}
