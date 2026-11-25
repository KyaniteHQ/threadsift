import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { VaultResultSchema } from "../src/core/contract/vault-contract.ts";
import { sealedSecrets } from "../src/core/kernel/sealed-secret.ts";
import { Instance } from "./instance.ts";

const VERIFY = "/api/settings/obsidian/verify";
const TARGET = { mode: "github", repository: "owner/notes", branch: "main" } as const;

describe("a GitHub Vault mirror sealed under another key", () => {
  let foreign: Instance;

  before(async () => {
    const other = await sealedSecrets("ab".repeat(32));

    assert.ok(other !== null);

    foreign = await Instance.start({ secretKey: "cd".repeat(32) });
    await foreign.setUp();
    foreign.database.exec(
      "insert into vault_settings (id, mode, repository, branch, sealed_token) values (1, 'github', ?, ?, ?)",
      TARGET.repository,
      TARGET.branch,
      await other.seal("github_pat_saved"),
    );
  });

  after(async () => {
    await foreign.close();
  });

  it("answers Verify without a token with `secret-missing`", async () => {
    assert.deepEqual(await foreign.read("POST", VERIFY, VaultResultSchema, TARGET), {
      kind: "refused",
      reason: "secret-missing",
    });
  });
});
