import { type OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { FILE_ROUTE } from "../core/file-keys.ts";
import { servedImage } from "../core/image-serving.ts";
import { IMAGE_TYPES } from "../core/image-type.ts";
import type { Ports } from "../core/ports.ts";
import { jsonBody } from "./openapi.ts";
import { NOT_FOUND } from "./refusals.ts";
import { ErrorResponseSchema } from "./schemas.ts";

const FileParamsSchema = z.object({ id: z.string(), name: z.string() });

const ImageBytesSchema = z.string().openapi({ format: "binary" });

const imageRoute = createRoute({
  method: "get",
  path: `${FILE_ROUTE}items/{id}/{name}`,
  request: { params: FileParamsSchema },
  responses: {
    200: {
      description:
        "A stored image of an article, as the Reader's post text links it. It is served only while a published `media` row of the Item names this exact key as a stored image. Every answer, errors included, carries `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: no-referrer` and `Content-Security-Policy: default-src 'none'; sandbox; frame-ancestors 'none'`.",
      content: Object.fromEntries(IMAGE_TYPES.map((type) => [type, { schema: ImageBytesSchema }])),
      headers: z.object({
        "content-disposition": z.string().openapi({ example: 'inline; filename="image-1.png"' }),
      }),
    },
    401: jsonBody(ErrorResponseSchema, "No owner session and no agent token."),
    404: jsonBody(
      ErrorResponseSchema,
      "The key is not a file key, no Item has it, or it is not a stored image of a published `media` row: an unpublished or superseded image, a temporary file, a post text file or any other object. A key the grammar of `docs/architecture/files.md` refuses answers 404 too.",
    ),
  },
});

export function registerFileRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(imageRoute, async (c) => {
    const { id, name } = c.req.valid("param");
    const image = await servedImage(ports, `items/${id}/${name}`);

    if (image === null) return c.json({ error: NOT_FOUND }, 404);

    return c.body(image.body, 200, {
      "content-type": image.contentType,
      "content-length": String(image.size),
      "content-disposition": `inline; filename="${image.filename}"`,
    });
  });
}
