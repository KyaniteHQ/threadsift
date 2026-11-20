import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import { CanonicalNumberTextSchema } from "../../../core/contract/canonical-number.ts";
import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import { MAX_ATTEMPTS } from "../../../core/contract/job-contract.ts";
import {
  RESTORE_MAX_BYTES,
  NewRestoreSchema,
  RestoreStatusSchema,
  StartedRestoreSchema,
  restoreAnswerSchema,
} from "../../../core/contract/restore-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access, PART_CAP } from "../../../http/access.ts";
import { OWNER_SESSION_REFUSALS, jsonBody, jsonRequest, noContent } from "../../../http/openapi.ts";
import { notFound } from "../../../http/refusals.ts";
import { ID_REFUSAL, IdParamSchema } from "../../../http/route-input.ts";
import { cancelRestore } from "../core/restore-cancel.ts";
import { resumeRestore, startRestore } from "../core/restore-start.ts";
import { restoreStatus } from "../core/restore-state.ts";
import { createRestore, storePart } from "../core/restore-upload.ts";

const PartParamsSchema = IdParamSchema.extend({ part: CanonicalNumberTextSchema });

const OWNER_ONLY =
  " Only the owner's session may call this; an agent token gets 403, because a leaked token must not write a whole library.";

const LIBRARY_NOT_EMPTY =
  "The library holds Items, Topics, Tags, Log entries, Proposals, Pins or Import cursors, so nothing can be restored into it.";

const OPEN = "Another restore is waiting for its upload or is running.";

const PAST_UPLOAD = { error: "The restore is past its upload", code: "not-uploading" as const };

const FINISHED = {
  error: "The restore is done, so there is nothing to cancel",
  code: "finished" as const,
};

const NOT_RESUMABLE = {
  error: "The restore did not give up, or its cancel is running",
  code: "not-resumable" as const,
};

const SUPERSEDED = {
  error: "A newer restore exists, so only that one can be cancelled or resumed",
  code: "superseded" as const,
};

const createRestoreRoute = createRoute({
  method: "post",
  path: "/api/restore",
  middleware: access("owner"),
  request: { body: jsonRequest(NewRestoreSchema) },
  responses: {
    201: jsonBody(
      StartedRestoreSchema,
      `A restore is waiting for its upload. Cut the zip into parts of \`partBytes\` (the last part holds the rest) and send each with \`PUT /api/restore/{id}/parts/{n}\`. \`bytes\` is at most ${String(RESTORE_MAX_BYTES / 1_000_000_000)} GB, and \`parts\` is \`bytes\` divided by \`partBytes\`, rounded up.${OWNER_ONLY}`,
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "`parts` is not `bytes` divided by `partBytes`, rounded up.",
    ),
    ...OWNER_SESSION_REFUSALS,
    409: jsonBody(
      restoreAnswerSchema("library-not-empty", "restore-open"),
      `\`code\` is \`library-not-empty\`: ${LIBRARY_NOT_EMPTY} Or \`restore-open\`: ${OPEN}`,
    ),
  },
});

const statusRoute = createRoute({
  method: "get",
  path: "/api/restore",
  middleware: access("owner"),
  responses: {
    200: jsonBody(
      RestoreStatusSchema,
      `The newest restore, or \`{ "state": "none" }\`. \`libraryEmpty\` says whether a restore can start. \`uploading\` lists the \`received\` parts, so a client that reloaded sends the missing ones. \`running\` carries the \`phase\` (\`check\`, \`tables\` or \`finish\`) and the rows \`restored\` and \`dropped\` for each table, where a dropped row had no parent row in the zip or repeated the key of an earlier row. \`cancelling\` has no counts. \`done\` carries the same counts. \`failed\` carries a \`failure\` word: a refusal code of the check (\`not-a-zip\`, \`unsupported-compression\`, \`bad-entry-name\`, \`no-manifest\`, \`format\`, \`other-release\`, \`unknown-table\`, \`unknown-column\`, \`missing-column\` or \`crc\`), or \`gave-up\` (a unit failed ${String(MAX_ATTEMPTS)} times). \`cancelFailed\` is true when the failed run was a cancel. \`resumable\` is true for \`gave-up\` while every part of the zip is still stored, and a refusal keeps no part. \`cancelled\` has no counts.${OWNER_ONLY}`,
    ),
    ...OWNER_SESSION_REFUSALS,
  },
});

const partRoute = createRoute({
  method: "put",
  path: "/api/restore/{id}/parts/{part}",
  middleware: access("owner", { body: PART_CAP }),
  request: {
    params: PartParamsSchema,
    body: {
      required: true,
      content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } },
    },
  },
  responses: {
    204: noContent(
      `The part is stored. Sending a part again replaces it, so a repeat is safe. The body must be exactly \`partBytes\` (${String(PART_CAP.bytes)}) bytes, except the last part, which holds the rest.${OWNER_ONLY}`,
    ),
    400: jsonBody(ErrorResponseSchema, "The body is not the length this part must have."),
    ...OWNER_SESSION_REFUSALS,
    404: jsonBody(ErrorResponseSchema, "No restore has this id, or it has no such part."),
    409: jsonBody(
      restoreAnswerSchema("not-uploading"),
      "`code` is `not-uploading`: the restore is past its upload and holds no parts any more, because it is `done`, `cancelled`, or `failed` and cannot be resumed, so the part is not stored. A part that arrives late for a `running` restore, or a `failed` one that can be resumed, is stored.",
    ),
    413: jsonBody(ErrorResponseSchema, "The body is longer than `partBytes`."),
  },
});

const startRoute = createRoute({
  method: "post",
  path: "/api/restore/{id}/start",
  middleware: access("owner"),
  request: { params: IdParamSchema },
  responses: {
    202: jsonBody(
      StartedRestoreSchema.pick({ id: true }),
      `The restore was waiting for its start, the library is still empty and every part has arrived, so it is \`running\` in its \`check\` phase. Jobs check the whole zip first (a refusal shows in \`GET /api/restore\` as \`failed\` with a \`failure\` code, deletes the parts and writes nothing to the library), then restore the tables in foreign key order, one bounded unit after another, keep the ids of the zip, and then set each table's id counter. \`POST /api/items\` and \`POST /api/items/batch\` answer 503 while it runs and while it is \`failed\` with \`gave-up\`, until it is resumed or cancelled.${OWNER_ONLY}`,
    ),
    400: jsonBody(
      restoreAnswerSchema("incomplete-upload"),
      "`code` is `incomplete-upload`: a part has not arrived, and the restore keeps its parts.",
    ),
    ...OWNER_SESSION_REFUSALS,
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
  middleware: access("owner"),
  request: { params: IdParamSchema },
  responses: {
    ...ID_REFUSAL,
    202: jsonBody(
      StartedRestoreSchema.pick({ id: true }),
      `The restore was \`running\` or \`failed\` and had got past its \`check\` phase, so it is now \`cancelling\`, and jobs now delete every restored row, one bounded unit after another in the reverse of the table order, then every file under \`items/\`, and then the uploaded parts. \`GET /api/restore\` shows \`cancelled\` when the library is empty again. The ids the restore used are not reused. A restore that had written no library record answers 204 instead. A repeat while an undo runs answers 202 again. A cancel that fails ${String(MAX_ATTEMPTS)} times shows \`failed\` with \`cancelFailed\` true, and a cancel again continues it.${OWNER_ONLY}`,
    ),
    204: noContent(
      `The restore is \`cancelled\` at once and has no library record to undo, because it was waiting for its upload, it had written no library record (a refusal of the check included), or it was cancelled before. Its parts are deleted and the library stays as it is. A new restore is accepted once the library is empty.${OWNER_ONLY}`,
    ),
    ...OWNER_SESSION_REFUSALS,
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
  middleware: access("owner"),
  request: { params: IdParamSchema },
  responses: {
    202: jsonBody(
      StartedRestoreSchema.pick({ id: true }),
      `The restore had \`failed\` with \`gave-up\` (a unit failed ${String(MAX_ATTEMPTS)} times), so it is \`running\` again and a job continues from the cursor of its last committed unit. It ends \`done\` with the rows an uninterrupted run writes.${OWNER_ONLY}`,
    ),
    400: jsonBody(
      restoreAnswerSchema("incomplete-upload"),
      "`code` is `incomplete-upload`: a part of the zip is gone, so the restore cannot continue. Cancel it and upload the zip again.",
    ),
    ...OWNER_SESSION_REFUSALS,
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
        return c.json(
          { error: "Some parts of the upload have not arrived", code: started.kind },
          400,
        );
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
        return c.json({ error: "Some parts of the upload are gone", code: resumed.kind }, 400);
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
