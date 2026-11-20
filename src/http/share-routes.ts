import type { OpenAPIHono } from "@hono/zod-openapi";

import { refreshedOf } from "../core/fetch-results.ts";
import { pasteLink } from "../core/paste.ts";
import type { Ports } from "../core/ports.ts";
import { SHARE_PATH, type ShareArrival, prefillOf, shareAddress } from "../core/share-address.ts";
import { type SharedContent, sharedContentOf } from "../core/shared-link.ts";
import { access } from "./access.ts";
import { SaveItemRequestSchema } from "./save-schemas.ts";
import { fieldsOf } from "./share-fields.ts";
import { isTrustedShare } from "./share-trust.ts";

async function savedFrom(ports: Ports, link: string): Promise<ShareArrival> {
  const request = SaveItemRequestSchema.safeParse({ url: link });

  if (!request.success) {
    return prefillOf(link, "invalid");
  }

  const saved = await pasteLink(ports, request.data.url, { kind: "owner" });

  switch (saved.kind) {
    case "refused": {
      return prefillOf(link, "private");
    }

    case "restoring": {
      return prefillOf(link, "restoring");
    }

    case "saved": {
      return {
        kind: "saved",
        id: saved.item.id,
        refreshed: refreshedOf(!saved.created, saved.item.fetch),
      };
    }

    default: {
      return saved satisfies never;
    }
  }
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
  app.on(["GET", "POST"], SHARE_PATH, access("self"), async (c) => {
    const fields = await fieldsOf(c);

    const arrival =
      fields === null
        ? prefillOf("", "invalid")
        : await arrivalFor(ports, sharedContentOf(fields), await isTrustedShare(c, ports));

    c.header("Cache-Control", "no-store");

    return c.redirect(shareAddress(arrival), 303);
  });
}
