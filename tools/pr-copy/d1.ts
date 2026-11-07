import { z } from "zod";

import { PageSchema, cloudflareCall } from "./cloudflare-api.ts";
import { type Stage, refuseOutsideTarget } from "./cloudflare.ts";

export async function queryDatabase<Row>(
  stage: Readonly<Stage>,
  database: Readonly<{ name: string; id: string }>,
  sql: string,
  row: z.ZodType<Row>,
): Promise<Row[]> {
  refuseOutsideTarget(stage.target, [database.name]);

  const body = await cloudflareCall(
    "POST",
    `d1/database/${encodeURIComponent(database.id)}/query`,
    PageSchema.extend({
      result: z.array(z.object({ success: z.literal(true), results: z.array(row) })),
    }),
    JSON.stringify({ sql }),
  );

  return body.result.flatMap((result) => result.results);
}

export async function appliedMigrations(
  stage: Readonly<Stage>,
  database: Readonly<{ name: string; id: string }>,
): Promise<string[]> {
  const rows = await queryDatabase(
    stage,
    database,
    "SELECT name FROM d1_migrations ORDER BY id",
    z.object({ name: z.string() }),
  );

  return rows.map((row) => row.name);
}
