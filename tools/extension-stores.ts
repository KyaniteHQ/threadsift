import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import {
  EXTENSION,
  ROOT,
  type Release,
  STORE_FILES,
  extensionRelease,
  storeFile,
} from "./extension-files.ts";
import { ACCESS_NAMES, type StoreAccess, storeAccess } from "./extension-store-access.ts";
import { type Expected, stableVersion, storeStatus, tagged } from "./extension-store-status.ts";
import { ReleaseError } from "./release-versions.ts";

const USAGE =
  "usage: node tools/extension-stores.ts submit --dry-run | submit v<X.Y.Z> | status [v<X.Y.Z>]";

function refuseUpload(tag: string, release: Readonly<Release>): void {
  const event = process.env["GITHUB_EVENT_NAME"];
  const ref = process.env["GITHUB_REF"];
  if (event !== "push" || ref !== `refs/tags/${tag}`) {
    throw new ReleaseError(
      `a real upload runs only in the release workflow's run for the pushed tag, and this run is ${event ?? "no workflow run"} on ${ref ?? "no ref"}; start the workflow by hand with dry_run for a sign-in check`,
    );
  }
  if (release.version !== stableVersion(tag)) {
    throw new ReleaseError(
      `${EXTENSION}/package.json carries ${release.version}, but the tag is ${tag}; a store gets only the version of the tag`,
    );
  }
}

function storeFiles(release: Readonly<Release>) {
  const missing = STORE_FILES.map((kind) => storeFile(release, kind)).filter(
    (file) => !existsSync(file),
  );
  if (missing.length > 0) {
    throw new ReleaseError(
      `the store files are missing, so run pnpm run package:extension first: ${missing.join(", ")}`,
    );
  }
  return {
    CHROME_ZIP: storeFile(release, "chrome"),
    FIREFOX_ZIP: storeFile(release, "firefox"),
    FIREFOX_SOURCES_ZIP: storeFile(release, "sources"),
  };
}

function submitEnv(access: Readonly<StoreAccess>, release: Readonly<Release>, dryRun: boolean) {
  const unused: readonly string[] =
    access.chromeSignIn.kind === "token"
      ? [ACCESS_NAMES.chromeEmail, ACCESS_NAMES.chromeKey]
      : [ACCESS_NAMES.chromeToken];
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !unused.includes(name))),
    ...storeFiles(release),
    CHROME_API_VERSION: "v2",
    CHROME_CANCEL_PENDING: "true",
    DRY_RUN: String(dryRun),
  };
}

function expectedOf(release: Readonly<Release>, tag: string | undefined): Expected {
  return tag === undefined ? { version: release.version, tag: undefined } : tagged(tag);
}

async function submit(tag: string | undefined): Promise<boolean> {
  const release = extensionRelease();
  if (tag !== undefined) refuseUpload(tag, release);
  storeFiles(release);
  const access = storeAccess();
  const dryRun = tag === undefined;
  const run = spawnSync("pnpm", ["--dir", EXTENSION, "exec", "wxt", "submit"], {
    cwd: ROOT,
    env: submitEnv(access, release, dryRun),
    stdio: "inherit",
  });
  const healthy = await storeStatus(access, expectedOf(release, tag));
  if (run.status !== 0) {
    throw new ReleaseError(
      `wxt submit ${run.error?.message ?? `exited ${String(run.status)}`}${dryRun ? " in a dry run, which uploads nothing" : ""}`,
    );
  }
  return healthy;
}

function main(): Promise<boolean> {
  const { values, positionals } = parseArgs({
    options: { "dry-run": { type: "boolean", default: false } },
    allowPositionals: true,
  });
  const [command, tag, ...rest] = positionals;
  const dryRun = values["dry-run"];
  if (rest.length === 0 && command === "submit" && dryRun === (tag === undefined)) {
    return submit(tag);
  }
  if (rest.length === 0 && command === "status" && !dryRun) {
    return storeStatus(storeAccess(), expectedOf(extensionRelease(), tag));
  }
  throw new ReleaseError(USAGE);
}

try {
  if (!(await main())) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
