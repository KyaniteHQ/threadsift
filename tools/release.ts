import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import {
  APP,
  ROOT,
  ReleaseError,
  TAG_PREFIX,
  VERSION_FILES,
  checkVersions,
  compare,
  format,
  parseVersion,
  readFile,
  replaceOnce,
  type Version,
} from "./release-versions.ts";

const UNRELEASED = "## Unreleased";
const ROOT_CHANGELOG = "CHANGELOG.md";
const BOT_CHANGELOG = "bot/CHANGELOG.md";
const MIGRATIONS = "migrations";

interface ReleasePlan {
  readonly version: Version;
  readonly kind: string;
  readonly edits: readonly Edit[];
}

function git(...args: readonly string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

interface Edit {
  readonly path: string;
  readonly before: string;
  readonly after: string;
  readonly change: string;
}

function releasedTags(): readonly Version[] {
  return git("tag", "--list", `${TAG_PREFIX}[0-9]*`)
    .split("\n")
    .flatMap((tag) => {
      const version = parseVersion(tag.slice(TAG_PREFIX.length));
      return version === undefined ? [] : [version];
    });
}

function newest(versions: readonly Version[]): Version | undefined {
  return versions.toSorted(compare).at(-1);
}

function unreleasedNotes(changelog: string, path: string): string {
  const start = changelog.indexOf(`${UNRELEASED}\n`);
  if (start === -1) {
    throw new ReleaseError(`${path} has no "${UNRELEASED}" heading`);
  }
  const body = changelog.slice(start + UNRELEASED.length + 1);
  const next = body.search(/^## /mu);
  return (next === -1 ? body : body.slice(0, next)).trim();
}

function cutChangelog(path: string, version: Version, requireNotes: boolean): Edit {
  const before = readFile(path);
  if (requireNotes && unreleasedNotes(before, path) === "") {
    throw new ReleaseError(
      `${path} has nothing under "${UNRELEASED}"; write the notes of ${TAG_PREFIX}${format(version)} there first`,
    );
  }
  const heading = `## ${TAG_PREFIX}${format(version)}`;
  return {
    path,
    before,
    after: replaceOnce(before, /^## Unreleased$/mu, `${UNRELEASED}\n\n${heading}`, path),
    change: `"${UNRELEASED}" becomes "${heading}" under a new empty "${UNRELEASED}"`,
  };
}

function migrationChanges(since: Version): readonly string[] {
  const diff = git(
    "diff",
    "--name-only",
    `${TAG_PREFIX}${format(since)}`,
    "HEAD",
    "--",
    MIGRATIONS,
  );
  return diff === "" ? [] : diff.split("\n");
}

function refusePatchWithMigration(version: Version, released: readonly Version[]): string {
  const stable = newest(released.filter((tag) => tag.rc === undefined));
  if (stable === undefined || stable.major !== version.major || stable.minor !== version.minor) {
    return stable === undefined
      ? "no stable release tag exists yet"
      : `a new major or minor after ${TAG_PREFIX}${format(stable)}`;
  }
  const changed = migrationChanges(stable);
  if (changed.length > 0) {
    throw new ReleaseError(
      `${TAG_PREFIX}${format(version)} is a patch release of ${TAG_PREFIX}${format(stable)}, and a patch never carries a migration, but these changed since ${TAG_PREFIX}${format(stable)}:\n${changed.join("\n")}\nrelease ${TAG_PREFIX}${version.major}.${version.minor + 1}.0 instead`,
    );
  }
  return `a patch release of ${TAG_PREFIX}${format(stable)}, with no migration changed since it`;
}

function versionEdits(version: Version): readonly Edit[] {
  return VERSION_FILES.flatMap((file) => {
    const before = readFile(file.path);
    const after = file.write(before, version);
    const reading = file.read(before);
    const from =
      reading.kind === "shared"
        ? format(reading.version)
        : `${reading.label}, the bot's own numbering,`;
    return after === before
      ? []
      : [{ path: file.path, before, after, change: `${from} to ${format(version)}` }];
  });
}

function planRelease(tag: string): ReleasePlan {
  const version = tag.startsWith(TAG_PREFIX)
    ? parseVersion(tag.slice(TAG_PREFIX.length))
    : undefined;
  if (version === undefined) {
    throw new ReleaseError(
      `${JSON.stringify(tag)} is not a release tag: give v<X.Y.Z> or v<X.Y.Z>-rc.<N>`,
    );
  }
  const released = releasedTags();
  const latest = newest(released);
  if (latest !== undefined && compare(version, latest) <= 0) {
    throw new ReleaseError(
      `${tag} is not above the newest release tag ${TAG_PREFIX}${format(latest)}`,
    );
  }
  const app = APP.read(readFile(APP.path));
  if (app.kind === "shared" && compare(version, app.version) <= 0) {
    throw new ReleaseError(
      `${tag} is not above ${format(app.version)}, the version ${APP.path} already carries`,
    );
  }
  const line = refusePatchWithMigration(version, released);
  const stable = version.rc === undefined;
  const changelogs = stable
    ? [cutChangelog(ROOT_CHANGELOG, version, true), cutChangelog(BOT_CHANGELOG, version, false)]
    : [];
  return {
    version,
    kind: `${stable ? "stable release" : "release candidate"}, ${line}`,
    edits: [...versionEdits(version), ...changelogs],
  };
}

function pullRequestBody(tag: string, stable: boolean, changelog: string): string {
  const notes = stable ? unreleasedNotes(changelog, ROOT_CHANGELOG) : "";
  return [
    `Set every version to \`${tag.slice(TAG_PREFIX.length)}\`${stable ? ` and cut the changelog's Unreleased section into \`${tag}\`` : ""}.`,
    "",
    `After the merge, tag the squash commit on \`main\` with \`${tag}\` and push the tag; the release workflow starts from the tag.`,
    ...(notes === "" ? [] : ["", "## Notes", "", notes]),
  ].join("\n");
}

function refuseUnlessAtMain(): void {
  if (git("status", "--porcelain") !== "") {
    throw new ReleaseError("the working tree has changes; run the release from a clean checkout");
  }
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    throw new ReleaseError("HEAD is not origin/main; run the release from the tip of main");
  }
}

function openPullRequest(tag: string, edits: readonly Edit[], stable: boolean): void {
  const branch = `release-${tag}`;
  const title = `chore(release): ${tag}`;
  const body = pullRequestBody(tag, stable, readFile(ROOT_CHANGELOG));
  git("switch", "--create", branch);
  for (const edit of edits) {
    writeFileSync(join(ROOT, edit.path), edit.after);
  }
  git("commit", "--quiet", "--message", title, "--", ...edits.map((edit) => edit.path));
  git("push", "--quiet", "--set-upstream", "origin", branch);
  const bodyFile = join(mkdtempSync(join(tmpdir(), "threadsift-release-")), "body.md");
  writeFileSync(bodyFile, body);
  const url = execFileSync(
    "gh",
    ["pr", "create", "--base", "main", "--head", branch, "--title", title, "--body-file", bodyFile],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  process.stdout.write(`opened ${url}\n`);
}

function release(tag: string, dryRun: boolean): void {
  git("fetch", "--quiet", "--tags", "origin", "main");
  if (!dryRun) {
    refuseUnlessAtMain();
  }
  const plan = planRelease(tag);
  process.stdout.write(`${tag}: ${plan.kind}\n`);
  for (const edit of plan.edits) {
    process.stdout.write(`  ${edit.path}: ${edit.change}\n`);
  }
  if (dryRun) {
    process.stdout.write(
      `dry run at ${git("rev-parse", "--short", "HEAD")}: changed no file; a release from the tip of main commits "chore(release): ${tag}" on a new branch release-${tag}, pushes it and opens a pull request to main\n`,
    );
    return;
  }
  openPullRequest(tag, plan.edits, plan.version.rc === undefined);
}

const { values, positionals } = parseArgs({
  options: { "dry-run": { type: "boolean", default: false } },
  allowPositionals: true,
});

try {
  const [command] = positionals;
  if (positionals.length !== 1 || command === undefined) {
    throw new ReleaseError("usage: node tools/release.ts check | v<version> [--dry-run]");
  }
  if (command === "check") {
    process.stdout.write(`${checkVersions()}\n`);
  } else {
    release(command, values["dry-run"]);
  }
} catch (error) {
  if (!(error instanceof ReleaseError)) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
