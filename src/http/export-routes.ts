import type { OpenAPIHono } from "@hono/zod-openapi";

import { zipStream } from "../core/export/export-download.ts";
import { deleteExport, exportStatus, readyExport, startExport } from "../core/export/export-run.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { deleteRoute, downloadRoute, startRoute, statusRoute } from "./export-route-spec.ts";
import { notFound } from "./refusals.ts";

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
