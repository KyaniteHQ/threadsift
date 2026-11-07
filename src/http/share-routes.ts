import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

import { refreshedOf } from "../core/fetch-results.ts";
import { saveItem } from "../core/items.ts";
import type { Ports } from "../core/ports.ts";
import { SHARE_PATH, type ShareArrival, prefillOf, shareAddress } from "../core/share-address.ts";
import { type SharedContent, sharedContentOf } from "../core/shared-link.ts";
import { bodyCap } from "./guard.ts";
import { SaveItemRequestSchema } from "./schemas.ts";
import { isTrustedShare } from "./share-trust.ts";

const FieldSchema = z.union([z.string(), z.file().transform(() => "")]).default("");

const SharedFieldsSchema = z.object({ title: FieldSchema, text: FieldSchema, url: FieldSchema });

async function savedFrom(ports: Ports, link: string): Promise<ShareArrival> {
  const request = SaveItemRequestSchema.safeParse({ url: link });

  if (!request.success) {
    return prefillOf(link, "invalid");
  }

  const saved = await saveItem(ports, request.data.url, request.data.digest);

  return saved.kind === "refused"
    ? prefillOf(link, "private")
    : {
        kind: "saved",
        id: saved.item.id,
        refreshed: refreshedOf(!saved.created, saved.item.fetch),
      };
}

function arrivalFor(
  ports: Ports,
  content: Readonly<SharedContent>,
  trusted: boolean,
): Promise<ShareArrival> | ShareArrival {
  switch (content.kind) {
    case "link": {
      return trusted ? savedFrom(ports, content.url) : prefillOf(content.url, null);
    }

    case "text": {
      return prefillOf(content.text, "invalid");
    }

    case "empty": {
      return prefillOf("", "empty");
    }

    default: {
      const exhaustive: never = content;

      return exhaustive;
    }
  }
}

export function registerShareRoutes(app: OpenAPIHono, ports: Ports): void {
  app.on(["GET", "POST"], SHARE_PATH, bodyCap, async (c) => {
    const posted = c.req.method === "POST";
    const fields = SharedFieldsSchema.parse(posted ? await c.req.parseBody() : c.req.query());

    const arrival = await arrivalFor(
      ports,
      sharedContentOf(fields),
      await isTrustedShare(c, ports),
    );

    c.header("Cache-Control", "no-store");

    return c.redirect(shareAddress(arrival), 303);
  });
}
