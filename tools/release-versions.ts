import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SEMVER =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-rc\.(?<rc>[1-9]\d*))?$/u;
export const TAG_PREFIX = "v";

type Reading =
  | { readonly kind: "shared"; readonly version: Version }
  | { readonly kind: "own"; readonly label: string };

interface VersionFile {
  readonly path: string;
  readonly gated: boolean;
  readonly read: (text: string) => Reading;
  readonly write: (text: string, version: Version) => string;
}

export class ReleaseError extends Error {}

const VersionGroupsSchema = z.object({
  major: z.coerce.number(),
  minor: z.coerce.number(),
  patch: z.coerce.number(),
  rc: z.coerce.number().optional(),
});

const PackageSchema = z.object({ version: z.string() });

export type Version = Readonly<z.infer<typeof VersionGroupsSchema>>;

export function parseVersion(text: string): Version | undefined {
  const groups = SEMVER.exec(text)?.groups;
  return groups === undefined ? undefined : VersionGroupsSchema.parse(groups);
}

function sharedVersion(text: string, where: string): Reading {
  const version = parseVersion(text);
  if (version === undefined) {
    throw new ReleaseError(
      `${where} holds ${JSON.stringify(text)}, which is not X.Y.Z or X.Y.Z-rc.N`,
    );
  }
  return { kind: "shared", version };
}

export function format(version: Version): string {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  return version.rc === undefined ? core : `${core}-rc.${version.rc}`;
}

export function compare(left: Version, right: Version): number {
  const stableRank = Number.MAX_SAFE_INTEGER;
  const order = [
    left.major - right.major,
    left.minor - right.minor,
    left.patch - right.patch,
    (left.rc ?? stableRank) - (right.rc ?? stableRank),
  ];
  return order.find((step) => step !== 0) ?? 0;
}

export function replaceOnce(
  text: string,
  pattern: Readonly<RegExp>,
  replacement: string,
  where: string,
): string {
  if (!pattern.test(text)) {
    throw new ReleaseError(`${where} has no line that matches ${pattern.source}`);
  }
  return text.replace(pattern, replacement);
}

function packageFile(path: string, gated: boolean): VersionFile {
  const line = /^ {2}"version": "[^"]*",$/mu;
  return {
    path,
    gated,
    read: (text) => sharedVersion(PackageSchema.parse(JSON.parse(text)).version, path),
    write: (text, version) => replaceOnce(text, line, `  "version": "${format(version)}",`, path),
  };
}

const IMAGE_LABEL = /^LABEL org\.opencontainers\.image\.version=(\S+)$/mu;
const BOT_TAG = /TAG=([^ ;]+)/u;
const BOT_OWN_VERSION = /^\d+$/u;

export const APP = packageFile("package.json", true);

export const VERSION_FILES: readonly VersionFile[] = [
  APP,
  {
    path: "Containerfile",
    gated: true,
    read: (text) => sharedVersion(IMAGE_LABEL.exec(text)?.[1] ?? "", "Containerfile"),
    write: (text, version) =>
      replaceOnce(
        text,
        IMAGE_LABEL,
        `LABEL org.opencontainers.image.version=${format(version)}`,
        "Containerfile",
      ),
  },
  packageFile("extension/package.json", false),
  {
    path: "bot/VERSION",
    gated: true,
    read: (text) =>
      BOT_OWN_VERSION.test(text.trim())
        ? { kind: "own", label: text.trim() }
        : sharedVersion(text.trim(), "bot/VERSION"),
    write: (_text, version) => `${format(version)}\n`,
  },
  {
    path: "bot/skills/threadsift/SKILL.md",
    gated: true,
    read: (text) => {
      const tag = BOT_TAG.exec(text)?.[1] ?? "";
      return tag.startsWith(TAG_PREFIX)
        ? sharedVersion(tag.slice(TAG_PREFIX.length), "the TAG pin of the bot skill")
        : { kind: "own", label: tag };
    },
    write: (text, version) =>
      replaceOnce(text, BOT_TAG, `TAG=${TAG_PREFIX}${format(version)}`, "the bot skill"),
  },
];

export function readFile(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function versionDifferences(): readonly string[] {
  const app = APP.read(readFile(APP.path));
  if (app.kind !== "shared") {
    throw new ReleaseError(`${APP.path} carries no shared version`);
  }
  return VERSION_FILES.filter((file) => file.gated).flatMap((file) => {
    const reading = file.read(readFile(file.path));
    return reading.kind === "shared" && compare(reading.version, app.version) !== 0
      ? [
          `${file.path} carries ${format(reading.version)}, but ${APP.path} carries ${format(app.version)}`,
        ]
      : [];
  });
}

export function checkVersions(): string {
  const differences = versionDifferences();
  const compared = VERSION_FILES.filter(
    (file) => file.gated && file.read(readFile(file.path)).kind === "shared",
  );
  if (differences.length > 0) {
    throw new ReleaseError(
      `every artifact carries the version of ${APP.path}; set them all with the release command\n${differences.join("\n")}`,
    );
  }
  return `versions agree: ${compared.map((file) => file.path).join(", ")}`;
}
