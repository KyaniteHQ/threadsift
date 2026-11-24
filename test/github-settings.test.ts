import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import {
  GithubSaveResponseSchema,
  GithubSettingsViewSchema,
  GithubVerifyResultSchema,
} from "../src/core/contract/github-contract.ts";
import { sealedSecrets } from "../src/core/kernel/sealed-secret.ts";
import { Instance } from "./instance.ts";
import { seedGithubCooldown } from "./one-hop-fixtures.ts";
import { SECRET_KEY, count, exec, rows } from "./related-fixtures.ts";

const SETTINGS = "/api/settings/github";

const TOKEN = "github_pat_first_token_of_the_owner";

const NEXT_TOKEN = "github_pat_second_token_of_the_owner";

const SealedSchema = z.object({ sealed_token: z.string() });

const cooldowns = (instance: Instance) =>
  count(instance, "select count(*) as n from github_cooldown");

const sealedTokens = (instance: Instance) =>
  rows(instance, SealedSchema, "select sealed_token from github_settings").map(
    ({ sealed_token: sealed }) => sealed,
  );

const settingsOf = (instance: Instance) => instance.read("GET", SETTINGS, GithubSettingsViewSchema);

const verify = (instance: Instance) =>
  instance.read("POST", `${SETTINGS}/verify`, GithubVerifyResultSchema);

describe("the GitHub token is sealed on the Instance, never returned, and cannot be saved where the Instance has no sealing key", () => {
  let instance: Instance;
  let withoutKey: Instance;
  let sealer: NonNullable<Awaited<ReturnType<typeof sealedSecrets>>>;

  before(async () => {
    const opener = await sealedSecrets(SECRET_KEY);

    assert.ok(opener !== null);

    sealer = opener;
    instance = await Instance.start({ secretKey: SECRET_KEY });
    withoutKey = await Instance.start();
    await Promise.all([instance.setUp(), withoutKey.setUp()]);
  });

  after(async () => {
    await instance.close();
    await withoutKey.close();
  });

  it("starts with no token and tells Verify there is nothing to check", async () => {
    assert.deepEqual(await settingsOf(instance), { token: "none", secretReady: true });
    assert.deepEqual(await verify(instance), {
      kind: "refused",
      reason: "not-configured",
      status: null,
    });
  });

  it("saves a token sealed, answers that one is saved, and returns it in no answer", async () => {
    const saved = await instance.send("PUT", SETTINGS, { token: TOKEN });

    assert.deepEqual(GithubSaveResponseSchema.parse(JSON.parse(saved.body)), {
      token: "saved",
      secretReady: true,
    });

    const [sealed] = sealedTokens(instance);

    assert.equal(sealedTokens(instance).length, 1);
    assert.ok(sealed !== undefined && !sealed.includes(TOKEN));
    assert.equal(await sealer.open(sealed ?? ""), TOKEN);
    assert.ok(!saved.body.includes(TOKEN));
    assert.ok(!(await instance.send("GET", SETTINGS)).body.includes(TOKEN));
    assert.deepEqual(await settingsOf(instance), { token: "saved", secretReady: true });
  });

  it("replaces the saved token in the same row, and removes it, and removing again still succeeds", async () => {
    await instance.send("PUT", SETTINGS, { token: NEXT_TOKEN });

    const [replaced, ...others] = sealedTokens(instance);

    assert.deepEqual(others, []);
    assert.equal(await sealer.open(replaced ?? ""), NEXT_TOKEN);

    assert.deepEqual(await instance.read("DELETE", SETTINGS, GithubSettingsViewSchema), {
      token: "none",
      secretReady: true,
    });
    assert.deepEqual(sealedTokens(instance), []);
    assert.deepEqual(await instance.read("DELETE", SETTINGS, GithubSettingsViewSchema), {
      token: "none",
      secretReady: true,
    });
  });

  it("refuses to save a token on an Instance with no sealing key, and keeps nothing", async () => {
    assert.deepEqual(await settingsOf(withoutKey), { token: "none", secretReady: false });

    const refused = await withoutKey.send("PUT", SETTINGS, { token: TOKEN });

    assert.deepEqual(GithubSaveResponseSchema.parse(JSON.parse(refused.body)), {
      kind: "refused",
      reason: "secret-missing",
      status: null,
    });
    assert.deepEqual(sealedTokens(withoutKey), []);
    assert.deepEqual(
      await withoutKey.read("POST", `${SETTINGS}/verify`, GithubVerifyResultSchema),
      { kind: "refused", reason: "secret-missing", status: null },
    );
  });
});

describe("a GitHub token the Instance cannot open is reported, does not block a replacement or a removal, and Verify names it", () => {
  let instance: Instance;
  let foreignSeal: string;

  before(async () => {
    const other = await sealedSecrets("ab".repeat(32));

    assert.ok(other !== null);

    foreignSeal = await other.seal(TOKEN);
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  const seedForeign = () => {
    exec(
      instance,
      "insert or replace into github_settings (id, sealed_token) values (1, ?)",
      foreignSeal,
    );
  };

  it("reads the token as unreadable and answers Verify with secret-missing", async () => {
    seedForeign();

    assert.deepEqual(await settingsOf(instance), { token: "unreadable", secretReady: true });
    assert.deepEqual(await verify(instance), {
      kind: "refused",
      reason: "secret-missing",
      status: null,
    });
  });

  it("replaces it with a new token", async () => {
    seedForeign();

    await instance.send("PUT", SETTINGS, { token: NEXT_TOKEN });

    assert.deepEqual(await settingsOf(instance), { token: "saved", secretReady: true });
  });

  it("removes it", async () => {
    seedForeign();

    assert.deepEqual(await instance.read("DELETE", SETTINGS, GithubSettingsViewSchema), {
      token: "none",
      secretReady: true,
    });
  });
});

describe("a stored GitHub cooldown answers Verify with rate-limited, and a changed token clears it", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await instance.send("PUT", SETTINGS, { token: TOKEN });
  });

  after(() => instance.close());

  it("refuses Verify with rate-limited and no status while the cooldown holds", async () => {
    seedGithubCooldown(instance);

    assert.deepEqual(await verify(instance), {
      kind: "refused",
      reason: "rate-limited",
      status: null,
    });
    assert.equal(cooldowns(instance), 1);
  });

  it("deletes the cooldown when the token is replaced", async () => {
    await instance.send("PUT", SETTINGS, { token: NEXT_TOKEN });

    assert.equal(cooldowns(instance), 0);
  });

  it("deletes the cooldown when the token is removed", async () => {
    seedGithubCooldown(instance);

    await instance.send("DELETE", SETTINGS);

    assert.equal(cooldowns(instance), 0);
  });

  it("keeps the cooldown when there was no token to remove", async () => {
    seedGithubCooldown(instance);

    await instance.send("DELETE", SETTINGS);

    assert.equal(cooldowns(instance), 1);
  });
});
