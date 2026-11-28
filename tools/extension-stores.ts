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
import {
  type Expected,
  type Store,
  type StoreRead,
  STORES,
  readStores,
  reportStores,
} from "./extension-store-status.ts";
import { git, remoteTags } from "./release-git.ts";
import { ReleaseError, TAG_PREFIX, newest, parseVersion, tagOf } from "./release-versions.ts";

const USAGE =
  "usage: node tools/extension-stores.ts submit --dry-run | submit v<X.Y.Z> | status [v<X.Y.Z>]";
const DAY_MS = 86_400_000;

function stableVersion(tag: string): string {
  const version = tag.startsWith(TAG_PREFIX) ? tag.slice(TAG_PREFIX.length) : "";
  const parsed = parseVersion(version);
  if (parsed === undefined || parsed.rc !== undefined) {
    throw new ReleaseError(
      `${JSON.stringify(tag)} is not a stable release tag v<X.Y.Z>; a release candidate never reaches a store`,
    );
  }
  return version;
}

function tagged(tag: string): Expected {
  const version = stableVersion(tag);
  const created = git("for-each-ref", "--format=%(creatordate:unix)", `refs/tags/${tag}`);
  if (created === "") {
    throw new ReleaseError(`the clone holds no tag ${tag}; fetch the tags first`);
  }
  return {
    version,
    tag: { name: tag, days: Math.floor((Date.now() - Number(created) * 1000) / DAY_MS) },
  };
}

function expectedOf(release: Readonly<Release>, tag: string | undefined): Expected {
  return tag === undefined ? { version: release.version, tag: undefined } : tagged(tag);
}

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
  const latest = newest(
    remoteTags()
      .map((other) => other.version)
      .filter((version) => version.rc === undefined),
  );
  if (latest !== undefined && tagOf(latest) !== tag) {
    throw new ReleaseError(
      `${tag} is not the newest stable tag on origin, ${tagOf(latest)} is, and a store refuses a version below the one it holds`,
    );
  }
}

function checkStoreFiles(release: Readonly<Release>): void {
  const missing = STORE_FILES.map((kind) => storeFile(release, kind)).filter(
    (file) => !existsSync(file),
  );
  if (missing.length > 0) {
    throw new ReleaseError(
      `the store files are missing, so run pnpm run package:extension first: ${missing.join(", ")}`,
    );
  }
}

function zipEntries(
  release: Readonly<Release>,
  store: Store,
): readonly (readonly [string, string])[] {
  return store === "Chrome Web Store"
    ? [["CHROME_ZIP", storeFile(release, "chrome")]]
    : [
        ["FIREFOX_ZIP", storeFile(release, "firefox")],
        ["FIREFOX_SOURCES_ZIP", storeFile(release, "sources")],
      ];
}

function submitEnv(
  access: Readonly<StoreAccess>,
  zips: Readonly<Record<string, string>>,
  dryRun: boolean,
) {
  const unused = new Set<string>(
    access.chromeSignIn.kind === "token"
      ? [ACCESS_NAMES.chromeEmail, ACCESS_NAMES.chromeKey]
      : [ACCESS_NAMES.chromeToken],
  );
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !unused.has(name))),
    ...zips,
    CHROME_API_VERSION: "v2",
    CHROME_CANCEL_PENDING: "true",
    DRY_RUN: String(dryRun),
  };
}

function storesToSubmit(reads: readonly StoreRead[]): readonly Store[] {
  const failed = reads.flatMap((read) =>
    read.kind === "failed" ? [`${read.store}: ${read.error}`] : [],
  );
  if (failed.length > 0) {
    throw new ReleaseError(
      `the upload needs each store's state first, to leave out a store that already holds the version; rerun the job: ${failed.join("; ")}`,
    );
  }
  return reads.flatMap((read) =>
    read.kind === "read" && !read.state.holds ? [read.state.store] : [],
  );
}

function runSubmit(
  access: Readonly<StoreAccess>,
  zips: Readonly<Record<string, string>>,
  dryRun: boolean,
): string | undefined {
  const run = spawnSync("pnpm", ["--dir", EXTENSION, "exec", "wxt", "submit"], {
    cwd: ROOT,
    env: submitEnv(access, zips, dryRun),
    stdio: "inherit",
  });
  return run.status === 0
    ? undefined
    : `wxt submit ${run.error?.message ?? `exited ${String(run.status)}`}${dryRun ? " in a dry run, which uploads nothing" : ""}`;
}

async function submit(tag: string | undefined): Promise<boolean> {
  const release = extensionRelease();
  if (tag !== undefined) refuseUpload(tag, release);
  checkStoreFiles(release);
  const access = storeAccess();
  const expected = expectedOf(release, tag);
  const stores = tag === undefined ? STORES : storesToSubmit(await readStores(access, expected));
  const zips = Object.fromEntries(
    STORES.flatMap((store) =>
      zipEntries(release, store).map(([name, file]) => [name, stores.includes(store) ? file : ""]),
    ),
  );
  if (stores.length === 0) {
    process.stdout.write(`both stores already hold ${expected.version}, so nothing is uploaded\n`);
  }
  const failure = stores.length === 0 ? undefined : runSubmit(access, zips, tag === undefined);
  const healthy = reportStores(await readStores(access, expected), expected);
  if (failure !== undefined) {
    throw new ReleaseError(
      healthy ? failure : `${failure}; the table also shows a store problem or a failed read`,
    );
  }
  return healthy;
}

async function main(): Promise<boolean> {
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
    const expected = expectedOf(extensionRelease(), tag);
    return reportStores(await readStores(storeAccess(), expected), expected);
  }
  throw new ReleaseError(USAGE);
}

try {
  if (!(await main())) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
