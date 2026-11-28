import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { call, git, remoteBranch } from "./release-git.ts";
import { ReleaseError, format, tagOf, type Version } from "./release-versions.ts";

interface Edit {
  readonly path: string;
  readonly after: string;
  readonly change: string;
}

export interface ReleasePlan {
  readonly version: Version;
  readonly lines: readonly string[];
  readonly edits: readonly Edit[];
  readonly notes: string;
}

function commitRelease(plan: ReleasePlan, base: string, title: string): string {
  const folder = mkdtempSync(join(tmpdir(), "threadsift-release-"));
  try {
    const env = { GIT_INDEX_FILE: join(folder, "index") };
    call("git", ["read-tree", base], { env });
    for (const edit of plan.edits) {
      const blob = call("git", ["hash-object", "-w", "--stdin"], { input: edit.after });
      const [mode] = git("ls-tree", base, "--", edit.path).split(" ");
      call("git", ["update-index", "--cacheinfo", `${mode ?? "100644"},${blob},${edit.path}`], {
        env,
      });
    }
    const tree = call("git", ["write-tree"], { env });
    const date = git("show", "--no-patch", "--format=%cI", base);
    return call("git", ["commit-tree", tree, "-p", base, "-m", title], {
      env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

function pullRequestBody(plan: ReleasePlan): string {
  const tag = tagOf(plan.version);
  return [
    `Set every version to \`${format(plan.version)}\`${plan.version.rc === undefined ? ` and turn the changelog's Unreleased section into the section of \`${tag}\`` : ""}.`,
    "",
    `After the merge, tag the squash commit on \`main\` with \`${tag}\` and push the tag; the release workflow starts from the tag.`,
    ...(plan.notes === "" ? [] : ["", "## Notes", "", plan.notes]),
  ].join("\n");
}

export function publish(plan: ReleasePlan, base: string): void {
  const tag = tagOf(plan.version);
  const branch = `release-${tag}`;
  const title = `chore(release): ${tag}`;
  const commit = commitRelease(plan, base, title);
  const pushed = remoteBranch(branch);
  if (pushed !== undefined && pushed !== commit) {
    throw new ReleaseError(
      `origin already has a branch ${branch} at ${pushed}, which is not this release's commit ${commit}; when no pull request needs it, delete it with git push origin --delete ${branch}, then run the command again`,
    );
  }
  if (pushed === undefined) {
    git("push", "--quiet", "origin", `${commit}:refs/heads/${branch}`);
  }
  const open = call("gh", [
    "pr",
    "list",
    "--head",
    branch,
    "--state",
    "open",
    "--json",
    "url",
    "--jq",
    ".[].url",
  ]);
  const url =
    open === ""
      ? call(
          "gh",
          [
            "pr",
            "create",
            "--base",
            "main",
            "--head",
            branch,
            "--title",
            title,
            "--body-file",
            "-",
          ],
          { input: pullRequestBody(plan) },
        )
      : open;
  process.stdout.write(`${open === "" ? "opened" : "already open:"} ${url}\n`);
}
