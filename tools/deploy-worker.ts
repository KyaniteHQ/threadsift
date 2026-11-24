import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs, stripVTControlCharacters } from "node:util";

import { unstable_readConfig } from "wrangler";
import { z } from "zod";

import {
  RESET_CODE_MIN,
  SETUP_CODE_MIN,
  checkConfiguredCode,
} from "../src/core/contract/setup-code.ts";
import { SECRET_KEY_PATTERN } from "../src/core/kernel/sealed-secret.ts";
import { PriceFlagSchema, settingVariablesOf } from "../src/targets/shared/settings.ts";

const REQUIRED_SECRETS = ["THREADSIFT_SECRET_KEY", "SETUP_CODE"] as const;
const WRANGLER = ["exec", "wrangler", "--env", ""];
const SecretsSchema = z.record(z.string(), z.string());
const { values } = parseArgs({
  options: { "secrets-file": { type: "string" }, "dry-run": { type: "boolean" } },
});
const config = z
  .object({
    name: z.string(),
    d1_databases: z.array(
      z.object({
        binding: z.string(),
        database_name: z.string().optional(),
        database_id: z.string().optional(),
      }),
    ),
  })
  .parse(unstable_readConfig({ config: "wrangler.jsonc", env: "" }));

class DeployError extends Error {}

function unusableSecrets(secrets: Readonly<z.infer<typeof SecretsSchema>>): readonly string[] {
  const set = settingVariablesOf(secrets);
  const key = set.THREADSIFT_SECRET_KEY;
  const flag = set.THREADSIFT_OPENROUTER_MAX_PRICE_ZERO;

  return [
    ...REQUIRED_SECRETS.flatMap((name) => (secrets[name] === "" ? [`${name} is empty`] : [])),
    ...(key === undefined || SECRET_KEY_PATTERN.test(key)
      ? []
      : ["THREADSIFT_SECRET_KEY must be 64 hex characters"]),
    ...(checkConfiguredCode(set.SETUP_CODE, SETUP_CODE_MIN).status === "short"
      ? [`SETUP_CODE must be at least ${SETUP_CODE_MIN} characters`]
      : []),
    ...(checkConfiguredCode(set.PASSWORD_RESET_CODE, RESET_CODE_MIN).status === "short"
      ? [`PASSWORD_RESET_CODE must be at least ${RESET_CODE_MIN} characters`]
      : []),
    ...(flag === undefined || PriceFlagSchema.safeParse(flag).success
      ? []
      : [`THREADSIFT_OPENROUTER_MAX_PRICE_ZERO must be ${PriceFlagSchema.options.join(" or ")}`]),
  ];
}

function secretsOf(path: string): z.infer<typeof SecretsSchema> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new DeployError(`Cannot read secrets file ${path}. Check its path and read permissions.`);
  }

  const invalid = `Invalid JSON secrets file ${path}. Use {"THREADSIFT_SECRET_KEY":"<64 hex characters>","SETUP_CODE":"<setup code>"}.`;
  try {
    const secrets = SecretsSchema.safeParse(JSON.parse(text));
    if (!secrets.success) throw new DeployError(invalid);
    const unusable = unusableSecrets(secrets.data);
    if (unusable.length > 0) {
      throw new DeployError(`Unusable secrets in ${path}: ${unusable.join("; ")}.`);
    }
    return secrets.data;
  } catch (error) {
    if (error instanceof DeployError) throw error;
    throw new DeployError(invalid);
  }
}

function pnpm(
  args: readonly string[],
  capture = false,
  missingMessage: string | null = null,
): string | null {
  const result = spawnSync("pnpm", args, {
    encoding: "utf8",
    stdio: ["ignore", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"],
  });
  if (result.error) {
    throw new DeployError("Cannot start pnpm. Check that pnpm is installed and on PATH.");
  }
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (missingMessage !== null && stripVTControlCharacters(output).includes(missingMessage)) {
      return null;
    }
    process.stderr.write(output);
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? "";
}

function checkSecrets(supplied: Readonly<z.infer<typeof SecretsSchema>>): void {
  const missing = REQUIRED_SECRETS.filter((name) => supplied[name] === undefined);
  if (missing.length === 0) return;
  if (values["dry-run"] === true) {
    throw new DeployError(
      `Cannot verify inherited secrets in --dry-run: ${missing.join(", ")}. Supply them with --secrets-file for an offline check.`,
    );
  }
  const stored = pnpm(
    [...WRANGLER, "secret", "list", "--format", "json"],
    true,
    `Worker "${config.name}" not found.`,
  );
  const names = z.array(z.object({ name: z.string() })).parse(JSON.parse(stored ?? "[]"));
  const absent = missing.filter((name) => !names.some((secret) => secret.name === name));
  if (absent.length > 0) {
    throw new DeployError(
      `Missing required secrets: ${absent.join(", ")}. Supply them with --secrets-file.`,
    );
  }
}

function deploy(): void {
  const secretsFile = values["secrets-file"];
  const supplied = secretsFile === undefined ? {} : secretsOf(secretsFile);
  checkSecrets(supplied);

  if (values["dry-run"] !== true) {
    for (const database of config.d1_databases) {
      if (database.database_id === undefined) {
        const name = database.database_name;
        if (name === undefined) {
          throw new DeployError(
            `D1 binding ${database.binding} needs database_id or database_name in wrangler.jsonc.`,
          );
        }
        const existing = pnpm(
          [...WRANGLER, "d1", "info", name, "--json"],
          true,
          `Couldn't find a D1 DB named '${name}'`,
        );
        if (existing === null) {
          pnpm([...WRANGLER, "d1", "create", name, "--no-update-config"]);
        }
      }
      pnpm([...WRANGLER, "d1", "migrations", "apply", database.binding, "--remote"]);
    }
  }
  pnpm(["run", "build"]);
  pnpm([
    ...WRANGLER,
    "deploy",
    "--keep-vars",
    ...(secretsFile === undefined ? [] : ["--secrets-file", secretsFile]),
    ...(values["dry-run"] === true ? ["--dry-run"] : []),
  ]);
}

try {
  deploy();
} catch (error) {
  if (!(error instanceof DeployError)) throw error;
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
