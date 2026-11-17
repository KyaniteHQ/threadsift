import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs, parseEnv } from "node:util";

import { unstable_readConfig } from "wrangler";
import { z } from "zod";

const { values } = parseArgs({
  options: { "secrets-file": { type: "string" }, "dry-run": { type: "boolean" } },
});
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
  .parse(unstable_readConfig({ config: "wrangler.jsonc", env: "" }));
const secretsFile = values["secrets-file"];
const WRANGLER = ["exec", "wrangler", "--env", ""];

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

function pnpm(args: readonly string[], capture = false): string {
  const result = spawnSync("pnpm", args, {
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
    .parse(JSON.parse(pnpm([...WRANGLER, "d1", "list", "--json"], true)));

  for (const database of config.d1_databases) {
    if (
      database.database_id === undefined &&
      !databases.some(({ name }) => name === database.database_name)
    ) {
      pnpm([...WRANGLER, "d1", "create", database.database_name, "--no-update-config"]);
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
