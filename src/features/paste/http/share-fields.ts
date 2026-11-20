import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

const FieldSchema = z.union([z.string(), z.file().transform(() => "")]).default("");

const SharedFieldsSchema = z.object({ title: FieldSchema, text: FieldSchema, url: FieldSchema });

export async function fieldsOf(c: Context) {
  if (c.req.method !== "POST") {
    return SharedFieldsSchema.parse(c.req.query());
  }

  try {
    return SharedFieldsSchema.parse(await c.req.parseBody());
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    return null;
  }
}
