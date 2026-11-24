import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempDisposableSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const REPOSITORY = join(import.meta.dirname, "..");

const KEY = "ab".repeat(32);

const USABLE = { THREADSIFT_SECRET_KEY: KEY, SETUP_CODE: "s".repeat(16) } as const;

const KEY_RULE = "THREADSIFT_SECRET_KEY must be 64 hex characters";
const SETUP_RULE = "SETUP_CODE must be at least 16 characters";
const RESET_RULE = "PASSWORD_RESET_CODE must be at least 32 characters";
const FLAG_RULE = "THREADSIFT_OPENROUTER_MAX_PRICE_ZERO must be true or false";

const REFUSED = [
  {
    name: "a key one character short",
    secrets: { ...USABLE, THREADSIFT_SECRET_KEY: KEY.slice(1) },
    rules: [KEY_RULE],
  },
  {
    name: "a key with a character that is not hex",
    secrets: { ...USABLE, THREADSIFT_SECRET_KEY: `${KEY.slice(1)}g` },
    rules: [KEY_RULE],
  },
  {
    name: "a key one character too long",
    secrets: { ...USABLE, THREADSIFT_SECRET_KEY: `${KEY}a` },
    rules: [KEY_RULE],
  },
  {
    name: "an empty setup code",
    secrets: { ...USABLE, SETUP_CODE: "" },
    rules: ["SETUP_CODE is empty"],
  },
  {
    name: "an empty key",
    secrets: { ...USABLE, THREADSIFT_SECRET_KEY: "" },
    rules: ["THREADSIFT_SECRET_KEY is empty"],
  },
  {
    name: "a setup code of 15 characters",
    secrets: { ...USABLE, SETUP_CODE: "s".repeat(15) },
    rules: [SETUP_RULE],
  },
  {
    name: "a reset code of 31 characters",
    secrets: { ...USABLE, PASSWORD_RESET_CODE: "r".repeat(31) },
    rules: [RESET_RULE],
  },
  ...(["true", "false"] as const).map((flag) => ({
    name: `a short reset code beside the price flag value ${flag}`,
    secrets: {
      ...USABLE,
      PASSWORD_RESET_CODE: "r".repeat(31),
      THREADSIFT_OPENROUTER_MAX_PRICE_ZERO: flag,
    },
    rules: [RESET_RULE],
  })),
  {
    name: "a reset code of 32 characters beside a price flag that is no flag value",
    secrets: {
      ...USABLE,
      PASSWORD_RESET_CODE: "r".repeat(32),
      THREADSIFT_OPENROUTER_MAX_PRICE_ZERO: "yes",
    },
    rules: [FLAG_RULE],
  },
  {
    name: "every rule broken at once",
    secrets: {
      THREADSIFT_SECRET_KEY: "",
      SETUP_CODE: "short",
      PASSWORD_RESET_CODE: "short",
      THREADSIFT_OPENROUTER_MAX_PRICE_ZERO: "yes",
    },
    rules: ["THREADSIFT_SECRET_KEY is empty", SETUP_RULE, RESET_RULE, FLAG_RULE],
  },
];

function dryRun(secrets: Readonly<Record<string, string>>) {
  using folder = mkdtempDisposableSync(join(tmpdir(), "threadsift-deploy-secrets-"));
  const path = join(folder.path, "secrets.json");

  writeFileSync(path, JSON.stringify(secrets));

  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    ["tools/deploy-worker.ts", "--dry-run", "--secrets-file", path],
    { cwd: REPOSITORY, encoding: "utf8", env: { HOME: folder.path, PATH: "" } },
  );

  return { status, stdout, stderr, path };
}

describe("the deploy tool refuses a secrets file the Instance could not use, before it builds or deploys", () => {
  for (const { name, secrets, rules } of REFUSED) {
    it(`stops for ${name} and names each broken rule`, () => {
      const { path, ...result } = dryRun(secrets);

      assert.deepEqual(result, {
        status: 1,
        stdout: "",
        stderr: `Unusable secrets in ${path}: ${rules.join("; ")}.\n`,
      });
    });
  }
});
