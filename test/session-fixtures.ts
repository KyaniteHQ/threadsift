import assert from "node:assert/strict";

import { SessionStateSchema } from "../src/core/contract/access-wire.ts";
import type { Instance } from "./instance.ts";

export async function databaseNameOf(instance: Instance): Promise<string> {
  const session = await instance.read("GET", "/api/session", SessionStateSchema);

  assert.ok(session.state === "signed-in", `the session check answers ${session.state}`);

  return session.database;
}
