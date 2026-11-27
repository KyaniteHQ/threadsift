import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve, sep } from "node:path";

import { z } from "zod";

import { loadInChromium } from "./extension-chrome-check.ts";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSION = "extension";
const WXT_OUTPUT = join(EXTENSION, ".output");
const ARCHIVE_MUST_HOLD = ["SOURCE_CODE_REVIEW.md", "README.md"];
const BUILD_ENV_KEPT = [
  "HOME",
  "TMPDIR",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "COREPACK_HOME",
  "pnpm_config_store_dir",
];

const BROWSERS = ["chrome", "firefox"] as const;

type Browser = (typeof BROWSERS)[number];

const BUILD_SCRIPTS: Readonly<Record<Browser, string>> = { chrome: "zip", firefox: "zip:firefox" };

const PackageSchema = z.object({ name: z.string().min(1), version: z.string().min(1) });
const ManifestSchema = z.object({ version: z.string().min(1) });
const LintSchema = z.object({
  summary: z.object({ errors: z.number(), warnings: z.number(), notices: z.number() }),
  warnings: z.array(z.object({ code: z.string(), file: z.string().optional() })),
});

class StepFailed extends Error {}

interface Release {
  readonly name: string;
  readonly version: string;
}

interface Spawn {
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly input?: string;
}

interface Outcome {
  readonly status: number | null;
  readonly cause: string | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

function spawned(command: string, args: readonly string[], options: Spawn): Outcome {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 ** 2,
    ...options,
  });

  return {
    status: result.status,
    cause: result.error?.message,
    stdout: result.error === undefined ? result.stdout : "",
    stderr: result.error === undefined ? result.stderr : "",
  };
}

function failure(step: string, command: string, outcome: Outcome): StepFailed {
  process.stderr.write(`${outcome.stdout}${outcome.stderr}`);

  return new StepFailed(
    `${step}: ${command} ${outcome.cause ?? `exited ${String(outcome.status)}`}`,
  );
}

function run(step: string, command: string, args: readonly string[], options: Spawn): string {
  const outcome = spawned(command, args, options);

  if (outcome.status !== 0) throw failure(step, `${command} ${args.join(" ")}`, outcome);

  return outcome.stdout;
}

function buildEnv() {
  const path = (process.env["PATH"] ?? "")
    .split(delimiter)
    .filter((entry) => entry !== "" && entry !== ROOT && !entry.startsWith(`${ROOT}${sep}`));
  const kept = BUILD_ENV_KEPT.flatMap((name) => {
    const value = process.env[name];

    return value === undefined ? [] : [[name, value] as const];
  });

  return { ...Object.fromEntries(kept), PATH: path.join(delimiter) };
}

function release(): Release {
  return PackageSchema.parse(
    JSON.parse(readFileSync(join(ROOT, EXTENSION, "package.json"), "utf8")),
  );
}

function zipName({ name, version }: Release, kind: Browser | "sources"): string {
  return `${name}-${version}-${kind}.zip`;
}

function unzip(zip: string, folder: string): string {
  mkdirSync(folder, { recursive: true });
  run(`unpack ${zip}`, "python3", ["-I", "-m", "zipfile", "-e", zip, folder], { cwd: ROOT });

  return folder;
}

function builtZip(root: string, into: string, target: Release, browser: Browser): string {
  run(
    `build the ${browser} zip in ${root}`,
    "pnpm",
    ["--filter", target.name, "run", BUILD_SCRIPTS[browser]],
    { cwd: root, env: buildEnv() },
  );

  const zip = join(root, WXT_OUTPUT, zipName(target, browser));

  if (!existsSync(zip)) throw new StepFailed(`WXT wrote no ${zip}`);

  return unzip(zip, join(into, browser));
}

function builtZips(root: string, into: string, target: Release): Record<Browser, string> {
  return {
    chrome: builtZip(root, into, target, "chrome"),
    firefox: builtZip(root, into, target, "firefox"),
  };
}

function manifestVersion(folder: string, target: Release): string {
  const manifest = ManifestSchema.safeParse(
    JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")),
  );

  if (!manifest.success) throw new StepFailed(`${folder}/manifest.json holds no version`);

  const { version } = manifest.data;

  if (target.version !== version && !target.version.startsWith(`${version}-`)) {
    throw new StepFailed(`${folder}/manifest.json reads ${version}, the package ${target.version}`);
  }

  return version;
}

function lintFirefox(folder: string): void {
  const report = LintSchema.parse(
    JSON.parse(
      run(
        "web-ext lint",
        "pnpm",
        ["--dir", EXTENSION, "exec", "web-ext", "lint", "--source-dir", folder, "--output", "json"],
        { cwd: ROOT },
      ),
    ),
  );
  const codes = [...new Set(report.warnings.map(({ code, file }) => `${code} in ${file ?? "?"}`))];

  process.stdout.write(
    `web-ext lint: ${String(report.summary.errors)} errors, ${String(report.summary.warnings)} warnings, ${String(report.summary.notices)} notices${codes.length > 0 ? ` (${codes.join(", ")})` : ""}\n`,
  );
}

function archivedCommit(): string {
  const workingTree = run("git stash create", "git", ["stash", "create"], { cwd: ROOT }).trim();

  return workingTree === ""
    ? run("git rev-parse", "git", ["rev-parse", "HEAD"], { cwd: ROOT }).trim()
    : workingTree;
}

function checkArchiveTree(commit: string): void {
  const files = run("list the archived files", "git", ["ls-tree", "-r", "--name-only", commit], {
    cwd: ROOT,
  });
  const ignored = spawned("git", ["check-ignore", "--no-index", "--stdin"], {
    cwd: ROOT,
    input: files,
  });

  if (ignored.status === 0) {
    throw new StepFailed(`the source archive would hold ignored files:\n${ignored.stdout}`);
  }

  if (ignored.status !== 1) throw failure("check the archived files", "git check-ignore", ignored);

  const held = new Set(files.split("\n"));
  const missing = ARCHIVE_MUST_HOLD.filter((file) => !held.has(file));

  if (missing.length > 0) {
    throw new StepFailed(`the source archive lacks ${missing.join(", ")}`);
  }
}

async function packageExtension(work: string): Promise<void> {
  const target = release();

  rmSync(join(ROOT, WXT_OUTPUT), { recursive: true, force: true });

  const first = builtZips(ROOT, join(work, "first"), target);
  const chromeVersion = manifestVersion(first.chrome, target);

  process.stdout.write(
    `${zipName(target, "chrome")}: manifest version ${chromeVersion}\n${zipName(target, "firefox")}: manifest version ${manifestVersion(first.firefox, target)}\n`,
  );
  lintFirefox(first.firefox);
  await loadInChromium(first.chrome, chromeVersion, work);

  const sources = join(ROOT, WXT_OUTPUT, zipName(target, "sources"));
  const commit = archivedCommit();

  checkArchiveTree(commit);
  run("git archive", "git", ["archive", "--format=zip", `--output=${sources}`, commit], {
    cwd: ROOT,
  });
  process.stdout.write(`${zipName(target, "sources")}: git archive of ${commit}\n`);

  const copy = unzip(sources, join(work, "source"));

  run("install in the source archive", "pnpm", ["install", "--frozen-lockfile"], {
    cwd: copy,
    env: buildEnv(),
  });

  const rebuilt = builtZips(copy, join(work, "rebuilt"), target);

  for (const browser of BROWSERS) {
    run(
      `compare the ${browser} rebuild from the source archive, which holds only files git tracks`,
      "diff",
      ["-r", first[browser], rebuilt[browser]],
      { cwd: ROOT },
    );
    process.stdout.write(`diff -r: the ${browser} rebuild from the source archive is identical\n`);
  }
}

function removeStoreFiles(): void {
  const target = release();

  for (const kind of [...BROWSERS, "sources"] as const) {
    rmSync(join(ROOT, WXT_OUTPUT, zipName(target, kind)), { force: true });
  }
}

const work = mkdtempSync(join(tmpdir(), "threadsift-extension-package-"));
const removeWork = (): void => {
  rmSync(work, { recursive: true, force: true });
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    removeWork();
    removeStoreFiles();
    process.exit(1);
  });
}

try {
  await packageExtension(work);
  process.stdout.write(`Store zips and the source archive are in ${join(ROOT, WXT_OUTPUT)}\n`);
} catch (error) {
  removeStoreFiles();
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\nThe store zips and the source archive were removed.\n`,
  );
  process.exitCode = 1;
} finally {
  removeWork();
}
