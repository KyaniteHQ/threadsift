import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { unstable_readConfig } from "wrangler";
import { z } from "zod";

import { CommandFailure } from "./command-failure.ts";
import { closePreview, previewDatabaseExists, resetPreview } from "./preview-cloudflare.ts";
import { hasForeignMigrations } from "./preview-migrations.ts";
import { provisionPreviewOwner } from "./preview-owner.ts";
import { REQUIRED_SECRETS, deployWithSecrets } from "./preview-secrets.ts";

const [action, number, mode, artifact] = process.argv.slice(2);
const operation = z.enum(["deploy", "close"]).parse(action);

const pr = z
  .string()
  .regex(/^[1-9]\d{0,7}$/u)
  .parse(number);

const selectedMode = z.enum(["--plan", "--dry-run", "--apply"]).parse(mode);
const plan = selectedMode === "--plan";
const name = `threadsift-pr-${pr}`;
const configPath = resolve(`.wrangler/${name}.json`);

const outputPath =
  process.env["WRANGLER_OUTPUT_FILE_PATH"] ?? resolve(`.wrangler/${name}-output.jsonl`);

const source = z
  .object({
    main: z.string(),
    compatibility_date: z.string(),
    compatibility_flags: z.array(z.string()),
    assets: z.object({
      directory: z.string(),
      binding: z.string(),
      run_worker_first: z.array(z.string()),
    }),
    alias: z.record(z.string(), z.string()),
    limits: z.object({ cpu_ms: z.number() }),
    triggers: z.object({ crons: z.array(z.string()) }),
  })
  .parse(unstable_readConfig({ config: "wrangler.jsonc" }));

function requireRegularFiles(path: string): void {
  const stat = lstatSync(path);

  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) requireRegularFiles(join(path, entry));
  } else if (!stat.isFile()) {
    throw new Error("Preview artifact must contain only regular files and directories");
  }
}

const root = artifact === undefined ? process.cwd() : resolve(artifact);

if (artifact !== undefined) {
  requireRegularFiles(root);
  z.literal(true).parse(lstatSync(join(root, "dist/worker/index.js")).isFile());
  z.literal(true).parse(lstatSync(join(root, "dist/web")).isDirectory());
  z.literal(true).parse(lstatSync(join(root, "migrations")).isDirectory());
}

const config = {
  ...source,
  main: artifact === undefined ? resolve(source.main) : join(root, "dist/worker/index.js"),
  no_bundle: artifact !== undefined,
  find_additional_modules: false,
  assets: {
    ...source.assets,
    directory: artifact === undefined ? resolve(source.assets.directory) : join(root, "dist/web"),
  },
  name,
  workers_dev: true,
  preview_urls: false,
  secrets: { required: REQUIRED_SECRETS },
  d1_databases: [
    { binding: "DB", database_name: `${name}-db`, migrations_dir: join(root, "migrations") },
  ],
  r2_buckets: [{ binding: "FILES", bucket_name: `${name}-files` }],
  queues: {
    producers: [{ binding: "JOBS", queue: `${name}-jobs` }],
    consumers: [{ queue: `${name}-jobs`, max_batch_size: 1 }],
  },
};

function wrangler(args: readonly string[]): string {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args, "--config", configPath], {
    encoding: "utf8",
    timeout: args[0] === "deploy" ? 600_000 : 120_000,
    env: {
      ...process.env,
      CI: "true",
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_OUTPUT_FILE_PATH: outputPath,
    },
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.status !== 0) {
    const providerCode = /\[code:\s*(\d+)\]/u.exec(`${result.stdout}${result.stderr}`)?.[1];
    throw new CommandFailure({
      kind: "command",
      reason: `Wrangler ${args.slice(0, 2).join(" ")} failed`,
      exitCode: result.status,
      providerCode: providerCode === undefined ? null : Number(providerCode),
      recovery:
        "Check the preview token permissions and the named Wrangler operation; rerun after correcting the cause. Raw provider output is omitted.",
    });
  }

  return result.stdout;
}

async function resetForeignHistory(): Promise<void> {
  if (
    !previewDatabaseExists(name, wrangler) ||
    !hasForeignMigrations(wrangler, ["--remote"], join(root, "migrations"))
  )
    return;

  console.log(`${name}-db has migrations this build lacks; deleting the preview to deploy it anew`);
  await resetPreview(name, wrangler);
}

async function deploy(): Promise<void> {
  if (
    !z.string().min(16).safeParse(process.env["PREVIEW_SETUP_CODE"]).success ||
    !z.string().min(15).safeParse(process.env["DEMO_OWNER_PASSWORD"]).success
  )
    throw new CommandFailure({
      kind: "check",
      reason: "Preview setup credentials are missing or too short",
      recovery:
        "Set PREVIEW_SETUP_CODE to at least 16 characters and DEMO_OWNER_PASSWORD to at least 15 in the preview environment.",
    });
  await resetForeignHistory();

  await deployWithSecrets(name, wrangler);

  wrangler(["d1", "migrations", "apply", "DB", "--remote"]);

  const entries = readFileSync(outputPath, "utf8")
    .trim()
    .split("\n")
    .map((line) =>
      z
        .object({ type: z.string(), targets: z.array(z.string()).optional() })
        .parse(JSON.parse(line)),
    );

  const target = entries
    .findLast((entry) => entry.type === "deploy")
    ?.targets?.find((url) => url.startsWith("https://"));

  const url = new URL(z.url().parse(target));

  if (
    url.protocol !== "https:" ||
    !url.hostname.startsWith(`${name}.`) ||
    !url.hostname.endsWith(".workers.dev")
  )
    throw new CommandFailure({
      kind: "check",
      reason: "Unexpected preview origin",
      recovery: "Inspect the Wrangler deployment target; no owner credential was sent.",
    });
  await provisionPreviewOwner(url.origin, wrangler);
}

console.log(
  JSON.stringify({
    operation,
    worker: name,
    database: `${name}-db`,
    bucket: `${name}-files`,
    queue: `${name}-jobs`,
    plan,
  }),
);

try {
  if (!plan) {
    mkdirSync(resolve(".wrangler"), { recursive: true });
    writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });

    if (selectedMode === "--dry-run") {
      if (operation !== "deploy")
        throw new CommandFailure({
          kind: "check",
          reason: "Use --plan for close",
          recovery: "Use close with --plan to inspect its manifest or --apply to delete it.",
        });
      wrangler(["deploy", "--dry-run"]);
      console.log("Wrangler compiled the preview without remote mutations");
    } else if (operation === "deploy") await deploy();
    else await closePreview(name, wrangler);
  }
} catch (error) {
  const failure =
    error instanceof CommandFailure
      ? error.failure
      : {
          kind: "check",
          reason: "Invalid preview configuration, response or transport failure",
          recovery:
            "Check preview credentials and account availability, then rerun the named operation.",
        };

  console.error(JSON.stringify({ operation, ...failure }));
  process.exitCode = 1;
}
