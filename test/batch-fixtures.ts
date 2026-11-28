import assert from "node:assert/strict";

import { BatchResponseSchema } from "../src/core/contract/batch-wire.ts";
import { type ImportState, ImportStateSchema } from "../src/core/contract/import-contract.ts";
import type { Instance } from "./instance.ts";

const linkFor = (cursor: string) => ({
  url: `https://x.com/someone/status/${String(3300000000 + Number(cursor))}`,
});

const storedImport = (answer: Readonly<{ body: string }>) =>
  BatchResponseSchema.parse(JSON.parse(answer.body)).import;

async function savedState(instance: Instance, name: string): Promise<ImportState> {
  const answer = await instance.send("GET", `/api/imports/${name}`);

  assert.equal(answer.status, 200);

  return ImportStateSchema.parse(JSON.parse(answer.body));
}

const guarded = (
  instance: Instance,
  name: string,
  cursor: string,
  previous: Readonly<ImportState>,
) =>
  instance.send("POST", "/api/items/batch", {
    links: [linkFor(cursor)],
    import: { name, cursor, previous: previous.cursor, previousUpdatedAt: previous.updatedAt },
  });

async function moveFromRead(instance: Instance, name: string, cursor: string): Promise<void> {
  const read = await savedState(instance, name);
  const moved = await guarded(instance, name, cursor, read);

  assert.equal(moved.status, 200);
  assert.deepEqual(storedImport(moved), { name, cursor });
  assert.ok((await savedState(instance, name)).updatedAt > read.updatedAt);
}

async function readAfterReturn(instance: Instance, name: string): Promise<ImportState> {
  await instance.send("POST", "/api/items/batch", {
    links: [linkFor("20")],
    import: { name, cursor: "20", previous: null },
  });

  const finished = await savedState(instance, name);

  await moveFromRead(instance, name, "7");
  await moveFromRead(instance, name, "14");
  await moveFromRead(instance, name, "20");

  return finished;
}

export async function lateCallKeepsCursor(instance: Instance, name: string): Promise<void> {
  const finished = await readAfterReturn(instance, name);
  const late = await guarded(instance, name, "7", finished);

  assert.equal(late.status, 200);
  assert.deepEqual(storedImport(late), { name, cursor: "20" });
  assert.equal((await savedState(instance, name)).cursor, "20");
}

export async function lateCallWithoutUpdatedAtSavesNothing(
  instance: Instance,
  name: string,
): Promise<void> {
  const finished = await readAfterReturn(instance, name);
  const before = { items: await instance.itemTotal(), state: await savedState(instance, name) };

  const late = await instance.send("POST", "/api/items/batch", {
    links: [linkFor("21")],
    import: { name, cursor: "7", previous: finished.cursor },
  });

  assert.deepEqual(
    {
      status: late.status,
      items: await instance.itemTotal(),
      state: await savedState(instance, name),
    },
    { status: 400, ...before },
  );
}
