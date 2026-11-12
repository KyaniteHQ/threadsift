import { DatabaseSync } from "node:sqlite";

import { drizzle } from "drizzle-orm/sqlite-proxy";

import type { Database } from "../src/core/ports.ts";
import { batchTo, proxyTo } from "../src/targets/node/database.ts";

export interface Interruption {
  readonly before?: (call: number) => Promise<void>;
  readonly after?: (call: number) => Promise<void>;
}

export const touchesProposals = (sql: string) => sql.includes('"proposals"');

export function interrupted(
  file: string,
  touches: (sql: string) => boolean,
  { before, after }: Readonly<Interruption>,
): Database {
  const sqlite = new DatabaseSync(file);
  const query = proxyTo(sqlite);
  const batch = batchTo(sqlite);
  let calls = 0;

  const around = async <Result>(counted: boolean, run: () => Promise<Result>): Promise<Result> => {
    if (!counted) return run();

    calls += 1;

    const call = calls;

    await before?.(call);

    const result = await run();

    await after?.(call);

    return result;
  };

  return drizzle(
    (sql, params, method) => around(touches(sql), () => query(sql, params, method)),
    (queries) =>
      around(
        queries.some(({ sql }) => touches(sql)),
        () => batch(queries),
      ),
  );
}

export function writingAfterTheFirstRead(
  file: string,
  touches: (sql: string) => boolean,
  write: () => Promise<void>,
): Database {
  return interrupted(file, touches, {
    after: async (call) => {
      if (call === 1) await write();
    },
  });
}
