import type { OpenAPIHono } from "@hono/zod-openapi";

import { type BatchEntry, pasteLinksThenSaveCursor } from "../core/batch-paste.ts";
import { refusalOf } from "../core/paste-refusal.ts";
import type { Ports } from "../core/ports.ts";
import { batchRoute } from "./batch-route-spec.ts";
import { savedView } from "./item-view.ts";
import { refusing } from "./refusals.ts";
import { callerOf, requirePasteScopes } from "./token-scopes.ts";

function resultOf(entry: Readonly<BatchEntry>) {
  if (entry.outcome === "refused") return entry;

  return { ...savedView(entry.item), outcome: entry.outcome };
}

export function registerBatchRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(batchRoute, async (c) => {
    const { links, import: cursor } = c.req.valid("json");

    requirePasteScopes(
      c,
      links.some(({ digest }) => digest !== undefined),
    );

    const pasted = await pasteLinksThenSaveCursor(ports, links, callerOf(c), cursor);

    if (pasted.kind !== "done") return refusing(c, refusalOf(pasted));

    return c.json({ results: pasted.entries.map(resultOf), import: pasted.import }, 200);
  });
}
