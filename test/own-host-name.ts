import assert from "node:assert/strict";
import { lookup } from "node:dns/promises";
import { hostname } from "node:os";

import { isGlobalAddress, isRefusedHost } from "../src/core/addresses.ts";

export async function ownPrivateHostName(): Promise<string> {
  const name = hostname();

  assert.ok(
    !isRefusedHost(name),
    "this test needs a machine whose own host name the app does not refuse by name, as it does localhost",
  );

  const resolved = await lookup(name, { all: true });

  assert.ok(
    resolved.every(({ address }) => !isGlobalAddress(address)),
    "this test needs a machine whose own host name resolves only to private addresses",
  );

  return name;
}
