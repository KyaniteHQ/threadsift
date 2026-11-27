import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { CHANGELOG, checkHeadline, cutChangelog, unreleasedNotes } from "./release-changelog.ts";
import {
  fetchTag,
  fileAt,
  git,
  migrationChanges,
  remoteTags,
  type ReleaseTag,
} from "./release-git.ts";
import { publish, type ReleasePlan } from "./release-publish.ts";
import {
  APP,
  COMPARED_FILES,
  FIRST_STABLE,
  RELEASE_FILES,
  ROOT,
  ReleaseError,
  TAG_PREFIX,
  compare,
  format,
  newest,
  parseVersion,
  tagOf,
  versionDifferences,
  type Version,
} from "./release-versions.ts";

const USAGE = 'usage: node tools/release.ts check | v<version> [--dry-run] [--headline "<phrase>"]';
const BOT_VERSION_FILE = "bot/VERSION";

interface PlanInput {
  readonly tag: string;
  readonly base: string;
  readonly headline: string | undefined;
  readonly fetchMissing: boolean;
}

function newestTag(tags: readonly ReleaseTag[]): ReleaseTag | undefined {
  const version = newest(tags.map((tag) => tag.version));
  return version === undefined
    ? undefined
    : tags.find((tag) => compare(tag.version, version) === 0);
}

function patchBaseline(version: Version, tags: readonly ReleaseTag[]): ReleaseTag | undefined {
  if (version.patch === 0) {
    return undefined;
  }
  const stable = newestTag(tags.filter((tag) => tag.version.rc === undefined));
  if (
    stable === undefined ||
    stable.version.major !== version.major ||
    stable.version.minor !== version.minor
  ) {
    throw new ReleaseError(
      `${tagOf(version)} is a patch release, so the newest stable release must be ${TAG_PREFIX}${version.major}.${version.minor}.x, and it is ${stable === undefined ? "none" : tagOf(stable.version)}`,
    );
  }
  return stable;
}

function refuseMigrations(version: Version, baseline: ReleaseTag, base: string): void {
  const changed = migrationChanges(baseline, base);
  if (changed.length > 0) {
    throw new ReleaseError(
      `${tagOf(version)} is a patch release of ${tagOf(baseline.version)}, and a patch never carries a migration, but these changed since ${tagOf(baseline.version)}:\n${changed.join("\n")}\nrelease ${TAG_PREFIX}${version.major}.${version.minor + 1}.0 instead`,
    );
  }
}

function refuseVersion(version: Version, tags: readonly ReleaseTag[], app: Version): void {
  const latest = newestTag(tags);
  if (latest !== undefined && compare(version, latest.version) <= 0) {
    throw new ReleaseError(
      `${tagOf(version)} is not above the newest release tag ${tagOf(latest.version)}`,
    );
  }
  if (compare(version, app) <= 0) {
    throw new ReleaseError(
      `${tagOf(version)} is not above ${format(app)}, the version ${APP.path} already carries`,
    );
  }
  const first = tags.every((tag) => tag.version.rc !== undefined);
  if (first && format({ ...version, rc: undefined }) !== FIRST_STABLE) {
    throw new ReleaseError(
      `no stable release exists yet, and the first one is ${TAG_PREFIX}${FIRST_STABLE}; give ${TAG_PREFIX}${FIRST_STABLE} or ${TAG_PREFIX}${FIRST_STABLE}-rc.<N>`,
    );
  }
}

function versionOfTag(tag: string): Version {
  const version = tag.startsWith(TAG_PREFIX)
    ? parseVersion(tag.slice(TAG_PREFIX.length))
    : undefined;
  if (version === undefined) {
    throw new ReleaseError(
      `${JSON.stringify(tag)} is not a release tag: give v<X.Y.Z> or v<X.Y.Z>-rc.<N>`,
    );
  }
  return version;
}

function versionEdits(read: (path: string) => string, version: Version): ReleasePlan["edits"] {
  return RELEASE_FILES.map((file) => {
    const before = read(file.path);
    return {
      path: file.path,
      after: file.write(before, version),
      change: `${format(file.read(before))} to ${format(version)}`,
    };
  });
}

function planRelease(input: PlanInput): ReleasePlan {
  const version = versionOfTag(input.tag);
  const read = (path: string): string => fileAt(input.base, path);
  const tags = remoteTags();
  refuseVersion(version, tags, APP.read(read(APP.path)));
  const baseline = patchBaseline(version, tags);
  if (baseline !== undefined) {
    if (input.fetchMissing) {
      fetchTag(baseline);
    }
    refuseMigrations(version, baseline, input.base);
  }
  checkHeadline(version, input.headline);
  const changelog = read(CHANGELOG);
  const stable = version.rc === undefined;
  const cut = stable ? cutChangelog(changelog, version, input.headline) : undefined;
  return {
    version,
    lines: [
      `${tagOf(version)}: ${stable ? "stable release" : "release candidate"}${baseline === undefined ? "" : `, a patch of ${tagOf(baseline.version)} with no migration file changed since it`}`,
      `  ${BOT_VERSION_FILE} and the bot skill's TAG pin stay at the bot's own number ${read(BOT_VERSION_FILE).trim()}, because an installed bot finds only bot-v tags until its update follows the Instance`,
    ],
    edits: [
      ...versionEdits(read, version),
      ...(cut === undefined
        ? []
        : [
            {
              path: CHANGELOG,
              after: cut.after,
              change: `"## Unreleased" becomes "${cut.heading}"`,
            },
          ]),
    ],
    notes: cut?.notes ?? unreleasedNotes(changelog),
  };
}

function readWorkingFile(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function check(): void {
  const read = readWorkingFile;
  const differences = versionDifferences(read);
  if (differences.length > 0) {
    throw new ReleaseError(
      `every artifact carries the version of ${APP.path}; run node tools/release.ts v<version> to set them all\n${differences.join("\n")}`,
    );
  }
  const app = APP.read(read(APP.path));
  process.stdout.write(
    `versions agree at ${format(app)}: ${COMPARED_FILES.map((file) => file.path).join(", ")}\n`,
  );
  if (app.patch === 0) {
    return;
  }
  const tags = remoteTags();
  if (tags.some((tag) => compare(tag.version, app) === 0)) {
    return;
  }
  const baseline = patchBaseline(app, tags);
  if (baseline !== undefined) {
    fetchTag(baseline);
    refuseMigrations(app, baseline, "HEAD");
    process.stdout.write(`no migration file changed since ${tagOf(baseline.version)}\n`);
  }
}

function release(tag: string, dryRun: boolean, headline: string | undefined): void {
  if (!dryRun) {
    git("fetch", "--quiet", "--no-tags", "origin", "main");
  }
  const base = git("rev-parse", dryRun ? "HEAD" : "refs/remotes/origin/main");
  const plan = planRelease({ tag, base, headline, fetchMissing: !dryRun });
  process.stdout.write(`${plan.lines.join("\n")}\n`);
  for (const edit of plan.edits) {
    process.stdout.write(`  ${edit.path}: ${edit.change}\n`);
  }
  if (dryRun) {
    process.stdout.write(
      `dry run of the files committed at ${base.slice(0, 8)}: wrote nothing; a release commits "chore(release): ${tag}" on origin/main, pushes it as release-${tag} and opens a pull request to main\n`,
    );
    return;
  }
  publish(plan, base);
}

function parsedArguments(): ReturnType<typeof parseCommandLine> {
  try {
    return parseCommandLine();
  } catch (error) {
    throw new ReleaseError(USAGE, { cause: error });
  }
}

function parseCommandLine() {
  return parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      headline: { type: "string" },
    },
    allowPositionals: true,
  });
}

try {
  const { values, positionals } = parsedArguments();
  const [command] = positionals;
  if (positionals.length !== 1 || command === undefined) {
    throw new ReleaseError(USAGE);
  }
  if (command === "check") {
    check();
  } else {
    release(command, values["dry-run"], values.headline);
  }
} catch (error) {
  if (!(error instanceof ReleaseError)) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
