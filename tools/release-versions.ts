import { fileURLToPath } from "node:url";

import { z } from "zod";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const TAG_PREFIX = "v";
export const FIRST_STABLE = "1.0.0";

const NUMBER = String.raw`0|[1-9]\d{0,14}`;
const SEMVER = new RegExp(
  `^(?<major>${NUMBER})\\.(?<minor>${NUMBER})\\.(?<patch>${NUMBER})(?:-rc\\.(?<rc>[1-9]\\d{0,14}))?$`,
  "u",
);

export class ReleaseError extends Error {}

const VersionSchema = z.object({
  major: z.coerce.number().int().nonnegative(),
  minor: z.coerce.number().int().nonnegative(),
  patch: z.coerce.number().int().nonnegative(),
  rc: z.coerce.number().int().positive().optional(),
});

export type Version = Readonly<z.infer<typeof VersionSchema>>;

export interface VersionFile {
  readonly path: string;
  readonly read: (text: string) => Version;
  readonly write: (text: string, version: Version) => string;
}

export function parseVersion(text: string): Version | undefined {
  const groups = SEMVER.exec(text)?.groups;
  return groups === undefined ? undefined : VersionSchema.parse(groups);
}

export function format(version: Version): string {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  return version.rc === undefined ? core : `${core}-rc.${version.rc}`;
}

export function tagOf(version: Version): string {
  return `${TAG_PREFIX}${format(version)}`;
}

function compareCandidates(left: number | undefined, right: number | undefined): number {
  if (left === undefined || right === undefined) {
    return (left === undefined ? 1 : 0) - (right === undefined ? 1 : 0);
  }
  return left - right;
}

export function compare(left: Version, right: Version): number {
  const order = [
    left.major - right.major,
    left.minor - right.minor,
    left.patch - right.patch,
    compareCandidates(left.rc, right.rc),
  ];
  return order.find((step) => step !== 0) ?? 0;
}

export function newest(versions: readonly Version[]): Version | undefined {
  return versions.toSorted(compare).at(-1);
}

function versionIn(text: string, where: string): Version {
  const version = parseVersion(text);
  if (version === undefined) {
    throw new ReleaseError(
      `${where} holds ${JSON.stringify(text)}, which is not X.Y.Z or X.Y.Z-rc.N`,
    );
  }
  return version;
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

const PackageSchema = z.object({ version: z.string() });

function packageFile(path: string): VersionFile {
  const line = /^ {2}"version": "[^"]*",$/mu;
  return {
    path,
    read: (text) => {
      const manifest = PackageSchema.safeParse(JSON.parse(text));
      if (!manifest.success) {
        throw new ReleaseError(`${path} has no "version" string`);
      }
      return versionIn(manifest.data.version, path);
    },
    write: (text, version) => replaceOnce(text, line, `  "version": "${format(version)}",`, path),
  };
}

const IMAGE_LABEL = /^LABEL org\.opencontainers\.image\.version=(\S+)$/mu;

const IMAGE: VersionFile = {
  path: "Containerfile",
  read: (text) => {
    const label = IMAGE_LABEL.exec(text)?.[1];
    if (label === undefined) {
      throw new ReleaseError("Containerfile has no LABEL org.opencontainers.image.version line");
    }
    return versionIn(label, "the version label of the Containerfile");
  },
  write: (text, version) =>
    replaceOnce(
      text,
      IMAGE_LABEL,
      `LABEL org.opencontainers.image.version=${format(version)}`,
      "Containerfile",
    ),
};

export const APP = packageFile("package.json");
export const COMPARED_FILES: readonly VersionFile[] = [APP, IMAGE];
export const RELEASE_FILES: readonly VersionFile[] = [
  ...COMPARED_FILES,
  packageFile("extension/package.json"),
];

export function versionDifferences(read: (path: string) => string): readonly string[] {
  const app = APP.read(read(APP.path));
  return COMPARED_FILES.flatMap((file) => {
    const version = file.read(read(file.path));
    return compare(version, app) === 0
      ? []
      : [`${file.path} carries ${format(version)}, but ${APP.path} carries ${format(app)}`];
  });
}
