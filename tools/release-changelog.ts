import { ReleaseError, tagOf, type Version } from "./release-versions.ts";

export const CHANGELOG = "CHANGELOG.md";
const UNRELEASED = "## Unreleased";

export interface ChangelogCut {
  readonly after: string;
  readonly heading: string;
  readonly notes: string;
}

function escaped(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function headingLines(changelog: string, pattern: Readonly<RegExp>): readonly number[] {
  return changelog.split("\n").flatMap((line, index) => (pattern.test(line) ? [index] : []));
}

export function unreleasedNotes(changelog: string): string {
  const found = headingLines(changelog, /^## Unreleased$/u);
  const [start] = found;
  if (found.length !== 1 || start === undefined) {
    throw new ReleaseError(
      `${CHANGELOG} must hold exactly one "${UNRELEASED}" heading, and it holds ${found.length}`,
    );
  }
  const lines = changelog.split("\n").slice(start + 1);
  const end = lines.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? lines : lines.slice(0, end)).join("\n").trim();
}

export function checkHeadline(version: Version, headline: string | undefined): void {
  if (headline === undefined) {
    return;
  }
  if (version.rc !== undefined || version.patch !== 0) {
    throw new ReleaseError(
      `only a stable release with patch 0 takes a headline, and ${tagOf(version)} is not one`,
    );
  }
  if (headline.trim() === "" || headline.includes("\n")) {
    throw new ReleaseError("the headline must be one line of text");
  }
}

export function cutChangelog(
  changelog: string,
  version: Version,
  headline: string | undefined,
): ChangelogCut {
  const notes = unreleasedNotes(changelog);
  const tag = tagOf(version);
  if (headingLines(changelog, new RegExp(`^## ${escaped(tag)}(?:: .+)?$`, "u")).length > 0) {
    throw new ReleaseError(`${CHANGELOG} already has a section for ${tag}`);
  }
  if (notes === "") {
    throw new ReleaseError(
      `${CHANGELOG} has nothing under "${UNRELEASED}"; write the notes of ${tag} there first`,
    );
  }
  const heading = headline === undefined ? `## ${tag}` : `## ${tag}: ${headline.trim()}`;
  return {
    after: changelog.replace(/^## Unreleased$/mu, `${UNRELEASED}\n\n${heading}`),
    heading,
    notes,
  };
}
