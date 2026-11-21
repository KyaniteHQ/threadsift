import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { ExportStatusSchema, StartedExportSchema } from "../src/core/contract/export-contract.ts";
import { ItemListResponseSchema } from "../src/core/contract/item-route-wire.ts";
import {
  RestoreStatusSchema,
  StartedRestoreSchema,
} from "../src/core/contract/restore-contract.ts";
import type { Instance } from "./instance.ts";
import { until } from "./related-fixtures.ts";

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
  return (await instance.read("GET", "/api/items", ItemListResponseSchema)).counts.total;
}

export async function restoreLibrary({
  from,
  into,
}: Readonly<{ from: Instance; into: Instance }>): Promise<void> {
  const fromCookie = from.sessionCookie;
  const intoCookie = into.sessionCookie;
  assert.ok(fromCookie !== null && intoCookie !== null, "Export and Restore need owner sessions");
  const run = await from.read("POST", "/api/export", StartedExportSchema);
  await until(
    () => from.read("GET", "/api/export", ExportStatusSchema),
    ({ state }) => state === "ready",
  );
  const download = await from.fetch(`/api/export/${String(run.id)}/download`, {
    headers: { cookie: fromCookie },
  });
  assert.equal(download.status, 200);
  const zip = await download.arrayBuffer();
  const restore = await into.read("POST", "/api/restore", StartedRestoreSchema, {
    bytes: zip.byteLength,
    parts: 1,
  });
  const path = `/api/restore/${String(restore.id)}`;
  const uploaded = await into.fetch(`${path}/parts/1`, {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      cookie: intoCookie,
      origin: "http://localhost",
    },
    body: zip,
  });

  assert.equal(uploaded.status, 204);
  assert.equal((await into.send("POST", `${path}/start`)).status, 202);
  await until(
    () => into.read("GET", "/api/restore", RestoreStatusSchema),
    ({ state }) => state === "done",
  );
}
