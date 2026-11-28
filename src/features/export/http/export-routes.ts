import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import {
  ErrorResponseSchema,
  UnavailableResponseSchema,
} from "../../../core/contract/error-wire.ts";
import {
  EXPORT_KEEP_MS,
  EXPORT_DOWNLOAD_PATH,
  ExportStatusSchema,
  SETTLE_MS,
  StartedExportSchema,
} from "../../../core/contract/export-contract.ts";
import { MAX_ATTEMPTS } from "../../../core/contract/job-contract.ts";
import { RESTORING_CODE } from "../../../core/contract/restore-contract.ts";
import { HOUR_MS, MINUTE_MS } from "../../../core/contract/time-units.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import {
  accessNote,
  accessRefusals,
  cacheHeaderList,
  jsonBody,
  noContent,
} from "../../../http/openapi.ts";
import { notFound } from "../../../http/refusals.ts";
import { IdParamSchema } from "../../../http/route-input.ts";
import { zipStream } from "../core/export-download.ts";
import { deleteExport, exportStatus, readyExport } from "../core/export-run.ts";
import { startExport } from "../core/export-start.ts";

const ZipBytesSchema = z.string().openapi({ format: "binary" });

const OWNER = access("owner");

const DOWNLOAD = access("owner", { cache: "file" });

const LEAK =
  " A leaked agent token must not copy the library in one request, so no scope opens this route.";

const startRoute = createRoute({
  method: "post",
  path: "/api/export",
  middleware: OWNER,
  description: accessNote(OWNER, LEAK),
  responses: {
    202: jsonBody(
      StartedExportSchema,
      `An export started and its first slice is queued; \`id\` names it. The export is a chain of job slices that survives a restart. A ready export that already exists is replaced and its objects are deleted.`,
    ),
    ...accessRefusals(OWNER),
    409: jsonBody(
      ErrorResponseSchema,
      "An export is running already. Wait for it, or delete it with `DELETE /api/export`.",
    ),
    503: jsonBody(
      UnavailableResponseSchema,
      "A Restore holds the library (`code` is `restoring`), so no export starts and a ready export stays. Start the export after the Restore has finished or been cancelled.",
    ),
  },
});

const HELD_START = {
  error:
    "A restore holds the library, so no export starts until the restore has finished or been cancelled.",
  code: RESTORING_CODE,
} as const;

const statusRoute = createRoute({
  method: "get",
  path: "/api/export",
  middleware: OWNER,
  description: accessNote(OWNER, LEAK),
  responses: {
    200: jsonBody(
      ExportStatusSchema,
      `The newest export that has not expired, or \`{ "state": "none" }\`. \`running\` carries \`entries\`, \`dataBytes\` and \`parts\`, the progress so far. \`ready\` adds \`finishedAt\` and \`zipBytes\`, the size of the download, and is kept ${String(EXPORT_KEEP_MS / HOUR_MS)} hours after \`finishedAt\`. \`failed\` carries a \`failure\` word: \`gave-up\` (a slice failed ${String(MAX_ATTEMPTS)} times) or \`list-changed\` (a deploy changed the list of tables while it ran). An export the owner stopped, or a newer export replaced, is never returned: the first reads as \`none\` and the second is never the newest. Times are in milliseconds.`,
    ),
    ...accessRefusals(OWNER),
  },
});

const downloadRoute = createRoute({
  method: "get",
  path: EXPORT_DOWNLOAD_PATH,
  middleware: DOWNLOAD,
  description: accessNote(DOWNLOAD, LEAK),
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: `The export as one zip, streamed from the stored slices in order. \`Content-Disposition\` is \`attachment; filename="threadsift-<UTC date>.zip"\`, \`Content-Length\` is \`zipBytes\`, and every answer of this route, errors included, carries ${cacheHeaderList("file")}. A client that disconnects ends the stream. There are no range requests: a download that stops starts again from the beginning.`,
      content: { "application/zip": { schema: ZipBytesSchema } },
    },
    ...accessRefusals(OWNER),
    404: jsonBody(
      ErrorResponseSchema,
      "No export has this id, or it is not `ready`: it is still running, failed, expired or replaced.",
    ),
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/api/export",
  middleware: OWNER,
  description: accessNote(OWNER, LEAK),
  responses: {
    204: noContent(
      `The export is gone from \`GET /api/export\`. A ready or failed export has its stored objects deleted at once. A running export stops, and the sweep deletes its objects ${String(SETTLE_MS / MINUTE_MS)} minutes later. A slice that a pause held past that point can still write afterwards, and a later sweep deletes what it wrote.`,
    ),
    ...accessRefusals(OWNER),
    404: jsonBody(ErrorResponseSchema, "There is no export to delete."),
  },
});

export function registerExportRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(startRoute, async (c) => {
    const started = await startExport(ports);

    switch (started.kind) {
      case "started":
        return c.json({ id: started.id }, 202);
      case "running":
        return c.json({ error: "An export is running already" }, 409);
      case "restoring":
        return c.json(HELD_START, 503);
      default: {
        const exhaustive: never = started;

        return exhaustive;
      }
    }
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
