import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import { ErrorResponseSchema } from "../core/contract/error-wire.ts";
import {
  EXPORT_KEEP_MS,
  EXPORT_DOWNLOAD_PATH,
  ExportStatusSchema,
  SETTLE_MS,
  StartedExportSchema,
} from "../core/contract/export-contract.ts";
import { MAX_ATTEMPTS } from "../core/contract/job-contract.ts";
import { HOUR_MS, MINUTE_MS } from "../core/contract/time-units.ts";
import { zipStream } from "../core/export/export-download.ts";
import { deleteExport, exportStatus, readyExport, startExport } from "../core/export/export-run.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { access } from "./access.ts";
import { OWNER_SESSION_REFUSALS, jsonBody, noContent } from "./openapi.ts";
import { notFound } from "./refusals.ts";
import { IdParamSchema } from "./route-input.ts";

const ZipBytesSchema = z.string().openapi({ format: "binary" });

const OWNER_ONLY =
  " Only the owner's session may call this; an agent token gets 403, because a leaked token must not copy the library in one request.";

const startRoute = createRoute({
  method: "post",
  path: "/api/export",
  middleware: access("owner"),
  responses: {
    202: jsonBody(
      StartedExportSchema,
      `An export started and its first slice is queued; \`id\` names it. The export is a chain of job slices that survives a restart. A ready export that already exists is replaced and its objects are deleted.${OWNER_ONLY}`,
    ),
    ...OWNER_SESSION_REFUSALS,
    409: jsonBody(
      ErrorResponseSchema,
      "An export is running already. Wait for it, or delete it with `DELETE /api/export`.",
    ),
  },
});

const statusRoute = createRoute({
  method: "get",
  path: "/api/export",
  middleware: access("owner"),
  responses: {
    200: jsonBody(
      ExportStatusSchema,
      `The newest export that has not expired, or \`{ "state": "none" }\`. \`running\` carries \`entries\`, \`dataBytes\` and \`parts\`, the progress so far. \`ready\` adds \`finishedAt\` and \`zipBytes\`, the size of the download, and is kept ${String(EXPORT_KEEP_MS / HOUR_MS)} hours after \`finishedAt\`. \`failed\` carries a \`failure\` word: \`gave-up\` (a slice failed ${String(MAX_ATTEMPTS)} times) or \`list-changed\` (a deploy changed the list of tables while it ran). An export the owner stopped, or a newer export replaced, is never returned: the first reads as \`none\` and the second is never the newest. Times are in milliseconds.${OWNER_ONLY}`,
    ),
    ...OWNER_SESSION_REFUSALS,
  },
});

const downloadRoute = createRoute({
  method: "get",
  path: EXPORT_DOWNLOAD_PATH,
  middleware: access("owner", { cache: "file" }),
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: `The export as one zip, streamed from the stored slices in order. \`Content-Disposition\` is \`attachment; filename="threadsift-<UTC date>.zip"\`, \`Content-Length\` is \`zipBytes\`, and the answer carries \`Cache-Control: no-store\`, \`X-Content-Type-Options: nosniff\`, \`Cross-Origin-Resource-Policy: same-origin\`, \`Referrer-Policy: no-referrer\` and \`X-Frame-Options: DENY\`. A client that disconnects ends the stream. There are no range requests: a download that stops starts again from the beginning.${OWNER_ONLY}`,
      content: { "application/zip": { schema: ZipBytesSchema } },
    },
    ...OWNER_SESSION_REFUSALS,
    404: jsonBody(
      ErrorResponseSchema,
      "No export has this id, or it is not `ready`: it is still running, failed, expired or replaced.",
    ),
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/api/export",
  middleware: access("owner"),
  responses: {
    204: noContent(
      `The export is gone from \`GET /api/export\`. A ready or failed export has its stored objects deleted at once. A running export stops, and the sweep deletes its objects ${String(SETTLE_MS / MINUTE_MS)} minutes later. A slice that a pause held past that point can still write afterwards, and a later sweep deletes what it wrote.${OWNER_ONLY}`,
    ),
    ...OWNER_SESSION_REFUSALS,
    404: jsonBody(ErrorResponseSchema, "There is no export to delete."),
  },
});

export function registerExportRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(startRoute, async (c) => {
    const started = await startExport(ports);

    return started.kind === "started"
      ? c.json({ id: started.id }, 202)
      : c.json({ error: "An export is running already" }, 409);
  });

  app.openapi(statusRoute, async (c) => c.json(await exportStatus(ports.db), 200));

  app.openapi(downloadRoute, async (c) => {
    const ready = await readyExport(ports.db, c.req.valid("param").id);

    if (ready === null) return notFound(c);

    return c.body(zipStream(ports.files, ready.keys), 200, {
      "content-type": "application/zip",
      "content-length": String(ready.size),
      "content-disposition": `attachment; filename="${ready.filename}"`,
    });
  });

  app.openapi(deleteRoute, async (c) => {
    const deleted = await deleteExport(ports);

    return deleted === "none" ? notFound(c) : c.body(null, 204);
  });
}
