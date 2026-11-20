import { createRoute, z } from "@hono/zod-openapi";

import { ErrorResponseSchema } from "../core/contract/error-wire.ts";
import { MAX_ATTEMPTS } from "../core/contract/job-contract.ts";
import {
  RESTORE_MAX_BYTES,
  NewRestoreSchema,
  RestoreErrorSchema,
  RestoreStatusSchema,
  StartedRestoreSchema,
} from "../core/contract/restore-contract.ts";
import { access, PART_CAP } from "./access.ts";
import { OWNER_SESSION_REFUSALS, jsonBody, jsonRequest, noContent } from "./openapi.ts";
import { IdParamSchema } from "./route-input.ts";

const PartParamsSchema = IdParamSchema.extend({ part: z.coerce.number().int().positive() });

const OWNER_ONLY =
  " Only the owner's session may call this; an agent token gets 403, because a leaked token must not write a whole library.";

export const LIBRARY_NOT_EMPTY =
  "The library holds Items, Topics, Tags, Log entries, Proposals, Pins or Import cursors, so nothing can be restored into it.";

export const OPEN = "Another restore is waiting for its upload or is running.";

export const createRestoreRoute = createRoute({
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
      RestoreErrorSchema,
      `\`code\` is \`library-not-empty\`: ${LIBRARY_NOT_EMPTY} Or \`restore-open\`: ${OPEN}`,
    ),
  },
});

export const statusRoute = createRoute({
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

export const partRoute = createRoute({
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
    409: jsonBody(ErrorResponseSchema, "The restore is no longer waiting for its upload."),
    413: jsonBody(ErrorResponseSchema, "The body is longer than `partBytes`."),
  },
});

export const startRoute = createRoute({
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
      RestoreErrorSchema,
      "`code` is `incomplete-upload`: a part has not arrived, and the restore keeps its parts.",
    ),
    ...OWNER_SESSION_REFUSALS,
    404: jsonBody(ErrorResponseSchema, "No restore has this id."),
    409: jsonBody(
      RestoreErrorSchema,
      `\`library-not-empty\`: ${LIBRARY_NOT_EMPTY} Or \`restore-open\`: the restore is not waiting for its start. Or \`vault-busy\`: the Vault mirror holds a write lease. The uploaded parts stay available for retry.`,
    ),
  },
});

export const cancelRoute = createRoute({
  method: "delete",
  path: "/api/restore/{id}",
  middleware: access("owner"),
  request: { params: IdParamSchema },
  responses: {
    202: jsonBody(
      StartedRestoreSchema.pick({ id: true }),
      `The restore was \`running\` or \`failed\`. When it got past its \`check\` phase it is now \`cancelling\`, and jobs now delete every restored row, one bounded unit after another in the reverse of the table order, then every file under \`items/\`, and then the uploaded parts. \`GET /api/restore\` shows \`cancelled\` when the library is empty again. The ids the restore used are not reused. A restore that never got past \`check\`, such as one the check refused, wrote no row, so it is \`cancelled\` at once, its parts are deleted, and the library stays as it is; a cancel again answers 204. A repeat while an undo runs answers 202 again. A cancel that fails ${String(MAX_ATTEMPTS)} times shows \`failed\` with \`cancelFailed\` true, and a cancel again continues it.${OWNER_ONLY}`,
    ),
    204: noContent(
      `The restore was waiting for its upload, or is already cancelled. Its parts are deleted, and a new restore is accepted.${OWNER_ONLY}`,
    ),
    ...OWNER_SESSION_REFUSALS,
    404: jsonBody(ErrorResponseSchema, "No restore has this id."),
    409: jsonBody(
      ErrorResponseSchema,
      "The restore is done, so there is nothing to cancel, or a newer restore exists, so only that one can be cancelled.",
    ),
  },
});

export const resumeRoute = createRoute({
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
      RestoreErrorSchema,
      "`code` is `incomplete-upload`: a part of the zip is gone, so the restore cannot continue. Cancel it and upload the zip again.",
    ),
    ...OWNER_SESSION_REFUSALS,
    404: jsonBody(ErrorResponseSchema, "No restore has this id."),
    409: jsonBody(
      ErrorResponseSchema,
      "The restore did not fail with `gave-up`, its cancel is running, or a newer restore exists. A refusal of the check cannot be resumed.",
    ),
  },
});
