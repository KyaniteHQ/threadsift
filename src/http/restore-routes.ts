import type { OpenAPIHono } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import { cancelRestore } from "../core/restore-cancel.ts";
import { resumeRestore, startRestore } from "../core/restore-start.ts";
import { restoreStatus } from "../core/restore-state.ts";
import { createRestore, storePart } from "../core/restore-upload.ts";
import { notFound } from "./refusals.ts";
import {
  LIBRARY_NOT_EMPTY,
  OPEN,
  cancelRoute,
  createRestoreRoute,
  partRoute,
  resumeRoute,
  startRoute,
  statusRoute,
} from "./restore-route-spec.ts";

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
        return notFound(c);
      case "not-uploading":
        return c.json(
          { error: "The restore is not waiting for its start", code: "restore-open" as const },
          409,
        );
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

function registerEndRoutes(app: OpenAPIHono, ports: Ports): void {
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
        return c.json({ error: "The restore is done, so there is nothing to cancel" }, 409);
      case "superseded":
        return c.json({ error: "A newer restore exists, so only that one can be cancelled" }, 409);
      default:
        return cancelled satisfies never;
    }
  });

  app.openapi(resumeRoute, async (c) => {
    const { id } = c.req.valid("param");
    const resumed = await resumeRestore(ports, id);

    switch (resumed.kind) {
      case "resumed":
        return c.json({ id }, 202);
      case "missing":
        return notFound(c);
      case "not-resumable":
        return c.json({ error: "The restore did not give up, or its cancel is running" }, 409);
      case "superseded":
        return c.json({ error: "A newer restore exists, so only that one can be resumed" }, 409);
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
  registerEndRoutes(app, ports);
}
