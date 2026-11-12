import { DatabaseSync } from "node:sqlite";

import { drizzle } from "drizzle-orm/sqlite-proxy";
import { z } from "zod";

import type { Database } from "../src/core/ports.ts";

export interface Interrupted {
  readonly db: Database;
  readonly calls: () => number;
}

const BindingsSchema = z.array(
  z.union([z.null(), z.number(), z.bigint(), z.string(), z.instanceof(Uint8Array)]),
);

const touchesProposals = (sql: string) => sql.includes('"proposals"');

export function interrupted(
  file: string,
  between: (call: number) => Promise<void>,
  touches: (sql: string) => boolean = touchesProposals,
): Interrupted {
  const sqlite = new DatabaseSync(file);
  let calls = 0;

  const execute = ({
    sql,
    params,
    method,
  }: Readonly<{ sql: string; params: unknown[]; method: string }>) => {
    const statement = sqlite.prepare(sql);

    statement.setReturnArrays(true);

    const bindings = BindingsSchema.parse(params);

    if (method === "run") {
      statement.run(...bindings);

      return { rows: [] };
    }

    return { rows: statement.all(...bindings) };
  };

  const db = drizzle(
    async (sql, params, method) => {
      if (touches(sql)) {
        calls += 1;
        await between(calls);
      }

      return execute({ sql, params, method });
    },
    async (queries) => {
      if (queries.some(({ sql }) => touches(sql))) {
        calls += 1;
        await between(calls);
      }

      sqlite.exec("BEGIN");

      try {
        return queries.map((query) => execute(query));
      } finally {
        sqlite.exec("COMMIT");
      }
    },
  );

  return { db, calls: () => calls };
}
