import { DatabaseSync } from "node:sqlite";

import { ItemReadResponseSchema } from "../src/core/contract/item-route-wire.ts";
import type { Instance } from "./instance.ts";

export function holdLibrary(
  instance: Instance,
  state: "running" | "failed",
  failure: "gave-up" | "no-manifest" | null,
  phase: "check" | "tables" = "tables",
): void {
  const database = new DatabaseSync(instance.databaseFile);

  database
    .prepare(
      "insert into restores (id, state, phase, failure, bytes, parts, part_bytes, created_at, updated_at) values (1, ?, ?, ?, 1, 1, 1, 1, 1) on conflict (id) do update set state = excluded.state, phase = excluded.phase, failure = excluded.failure",
    )
    .run(state, phase, failure);
  database.close();
}

export async function itemTotal(instance: Instance): Promise<number> {
  return (await instance.read("GET", "/api/items", ItemReadResponseSchema)).counts?.total ?? -1;
}
