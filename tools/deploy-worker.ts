import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs, parseEnv } from "node:util";

import { z } from "zod";

const { values } = parseArgs({
  options: { "secrets-file": { type: "string" }, "dry-run": { type: "boolean" } },
});
const wranglerModule = z
  .object({
    experimental_readRawConfig: z.function({
      input: [z.object({ config: z.string() })],
      output: z.object({ rawConfig: z.unknown() }),
    }),
  })
  .parse(await import("wrangler"));
const { rawConfig } = wranglerModule.experimental_readRawConfig({ config: "wrangler.jsonc" });
const config = z
  .object({
    d1_databases: z.array(
      z.object({
        binding: z.string(),
        database_name: z.string(),
        database_id: z.string().optional(),
      }),
    ),
    secrets: z.object({ required: z.array(z.string()) }),
  })
  .parse(rawConfig);
const secretsFile = values["secrets-file"];

if (secretsFile !== undefined) {
  const text = readFileSync(secretsFile, "utf8");
  const secrets = z
    .record(z.string(), z.string())
    .parse(secretsFile.endsWith(".json") ? JSON.parse(text) : parseEnv(text));
  const missing = config.secrets.required.filter(
    (name) => (process.env[name] ?? secrets[name] ?? "") === "",
  );

  if (missing.length > 0) {
    process.stderr.write(
      `Missing required secrets: ${missing.join(", ")}. Set them in ${secretsFile}.\n`,
    );
    process.exit(1);
  }
}

function wrangler(args: readonly string[], capture = false): string {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args, "--env", ""], {
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? "";
}

if (values["dry-run"] !== true) {
  const databases = z
    .array(z.object({ name: z.string() }))
    .parse(JSON.parse(wrangler(["d1", "list", "--json"], true)));

  for (const database of config.d1_databases) {
    if (
      database.database_id === undefined &&
      !databases.some(({ name }) => name === database.database_name)
    ) {
      wrangler(["d1", "create", database.database_name, "--no-update-config"]);
    }
    wrangler(["d1", "migrations", "apply", database.binding, "--remote"]);
  }
}

const build = spawnSync("pnpm", ["run", "build"], { stdio: "inherit" });
if (build.error) {
  throw build.error;
}
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

wrangler([
  "deploy",
  "--keep-vars",
  ...(secretsFile === undefined ? [] : ["--secrets-file", secretsFile]),
  ...(values["dry-run"] === true ? ["--dry-run"] : []),
]);
