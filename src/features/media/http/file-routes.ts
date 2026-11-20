import { type OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import { FILE_ROUTE, ITEM_FILES_ROOT, itemFileKey } from "../../../core/contract/file-keys.ts";
import { IMAGE_TYPES } from "../../../core/contract/image-type.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { accessNote, accessRefusals, cacheHeaderList, jsonBody } from "../../../http/openapi.ts";
import { notFound } from "../../../http/refusals.ts";
import { servedImage } from "../core/image-serving.ts";

const FileParamsSchema = z.object({ id: z.string(), name: z.string() });

const ImageBytesSchema = z.string().openapi({ format: "binary" });

const READER = access("read", { cache: "file" });

const imageRoute = createRoute({
  method: "get",
  path: `${FILE_ROUTE}${ITEM_FILES_ROOT}{id}/{name}`,
  middleware: READER,
  description: accessNote(READER),
  request: { params: FileParamsSchema },
  responses: {
    200: {
      description: `A stored image of an article, as the Reader's post text links it. It is served only while a published \`media\` row of the Item names this exact key as a stored image. Every answer, errors included, carries ${cacheHeaderList("file")}.`,
      content: Object.fromEntries(IMAGE_TYPES.map((type) => [type, { schema: ImageBytesSchema }])),
      headers: z.object({
        "content-disposition": z.string().openapi({ example: 'inline; filename="image-1.png"' }),
      }),
    },
    ...accessRefusals(READER),
    404: jsonBody(
      ErrorResponseSchema,
      "The key is not a file key, no Item has it, or it is not a stored image of a published `media` row: an unpublished or superseded image, a temporary file, a post text file or any other object.",
    ),
  },
});

export function registerFileRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(imageRoute, async (c) => {
    const { id, name } = c.req.valid("param");
    const image = await servedImage(ports, itemFileKey(id, name));

    if (image === null) return notFound(c);

    return c.body(image.body, 200, {
      "content-type": image.contentType,
      "content-length": String(image.size),
      "content-disposition": `inline; filename="${image.filename}"`,
    });
  });
}
