import type { OpenAPIHono } from "@hono/zod-openapi";

import { refusalOf } from "../core/paste-refusal.ts";
import { paste } from "../core/paste.ts";
import type { Ports } from "../core/ports.ts";
import { savedView } from "./item-view.ts";
import { refusing } from "./refusals.ts";
import { saveItemRoute } from "./save-route-spec.ts";
import { callerOf, requirePasteScopes } from "./token-scopes.ts";

export function registerSaveRoute(app: OpenAPIHono, ports: Ports): void {
  app.openapi(saveItemRoute, async (c) => {
    const { url, digest, content, page, fill } = c.req.valid("json");

    requirePasteScopes(c, digest !== undefined);

    const saved = await paste(ports, url, callerOf(c), { digest, content, page, fill });

    if (saved.kind !== "saved") return refusing(c, refusalOf(saved));

    return c.json(savedView(saved.item), saved.created ? 201 : 200);
  });
}
