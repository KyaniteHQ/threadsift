import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { chromium } from "@playwright/test";
import { z } from "zod";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSION = "extension";
const WXT_OUTPUT = join(EXTENSION, ".output");
const WORKER_START_MS = 15_000;

const BROWSERS = ["chrome", "firefox"] as const;
const PAGES = ["options.html", "popup.html"];

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

function run(step: string, command: string, args: readonly string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 ** 2 });

  if (result.status !== 0) {
    process.stderr.write(`${result.stdout}${result.stderr}`);
    throw new StepFailed(`${step}: ${command} ${args.join(" ")} exited ${String(result.status)}`);
  }

  return result.stdout;
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
  run(`unpack ${zip}`, "python3", ["-I", "-m", "zipfile", "-e", zip, folder], ROOT);
  return folder;
}

function builtZip(root: string, into: string, target: Release, browser: Browser): string {
  run(
    `build the ${browser} zip in ${root}`,
    "pnpm",
    ["--filter", target.name, "run", BUILD_SCRIPTS[browser]],
    root,
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
  const { version } = ManifestSchema.parse(
    JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")),
  );

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
        ROOT,
      ),
    ),
  );
  const codes = [...new Set(report.warnings.map(({ code, file }) => `${code} in ${file ?? "?"}`))];

  process.stdout.write(
    `web-ext lint: ${String(report.summary.errors)} errors, ${String(report.summary.warnings)} warnings, ${String(report.summary.notices)} notices${codes.length > 0 ? ` (${codes.join(", ")})` : ""}\n`,
  );

  if (report.summary.errors > 0) throw new StepFailed("web-ext lint found errors");
}

async function loadInChromium(folder: string, version: string, work: string): Promise<void> {
  const context = await chromium.launchPersistentContext(join(work, "chromium-profile"), {
    channel: "chromium",
    args: [`--disable-extensions-except=${folder}`, `--load-extension=${folder}`],
  });

  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker", { timeout: WORKER_START_MS }));
    const loaded = ManifestSchema.parse(
      await worker.evaluate<unknown>("chrome.runtime.getManifest()"),
    ).version;

    if (loaded !== version) {
      throw new StepFailed(`Chromium loaded version ${loaded}, not ${version}`);
    }

    const errors = await Promise.all(
      PAGES.map(async (page) => {
        const tab = await context.newPage();
        const thrown: string[] = [];

        tab.on("pageerror", (error) => thrown.push(`${page}: ${error.message}`));
        await tab.goto(new URL(page, worker.url()).href, { waitUntil: "load" });
        await tab.close();

        return thrown;
      }),
    );

    if (errors.flat().length > 0) throw new StepFailed(errors.flat().join("; "));
  } finally {
    await context.close();
  }

  process.stdout.write(
    `Chromium loaded the Chrome zip: the worker started, version ${version}, and ${PAGES.join(" and ")} threw nothing\n`,
  );
}

function archivedCommit(): string {
  const workingTree = run("git stash create", "git", ["stash", "create"], ROOT).trim();

  return workingTree === ""
    ? run("git rev-parse", "git", ["rev-parse", "HEAD"], ROOT).trim()
    : workingTree;
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

  run("git archive", "git", ["archive", "--format=zip", `--output=${sources}`, commit], ROOT);
  process.stdout.write(`${zipName(target, "sources")}: git archive of ${commit}\n`);

  const copy = unzip(sources, join(work, "source"));

  run("install in the source archive", "pnpm", ["install", "--frozen-lockfile"], copy);

  const rebuilt = builtZips(copy, join(work, "rebuilt"), target);

  for (const browser of BROWSERS) {
    run(
      `compare the ${browser} rebuild from the source archive, which holds only files git tracks`,
      "diff",
      ["-r", first[browser], rebuilt[browser]],
      ROOT,
    );
    process.stdout.write(`diff -r: the ${browser} rebuild from the source archive is identical\n`);
  }
}

const work = mkdtempSync(join(tmpdir(), "threadsift-extension-package-"));

try {
  await packageExtension(work);
  rmSync(work, { recursive: true, force: true });
  process.stdout.write(`Store zips and the source archive are in ${join(ROOT, WXT_OUTPUT)}\n`);
} catch (error) {
  process.stderr.write(`The work folder stays at ${work}\n`);

  if (!(error instanceof StepFailed)) throw error;

  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
