import type { ZodType } from "zod";

import { type JsonBody, parsedFrom, put } from "./calls.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

export function savedSetting<Parsed>(
  path: string,
  schema: ZodType<Parsed>,
  json: JsonBody,
): Promise<Parsed> {
  return parsedFrom(put(DATABASE_WRITE_DEADLINE_MS), path, schema, { json });
}
