import { execFileSync, spawnSync } from "node:child_process";

import { z } from "zod";

import {
  ROOT,
  ReleaseError,
  TAG_PREFIX,
  parseVersion,
  tagOf,
  type Version,
} from "./release-versions.ts";

const MIGRATION_FILES = ":(glob)migrations/*.sql";
const TAG_REF = /^refs\/tags\/([^^]+)(\^\{\})?$/u;
const FailedCallSchema = z.object({ stderr: z.string() });

export interface ReleaseTag {
  readonly version: Version;
  readonly commit: string;
}

interface CallOptions {
  readonly input?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly raw?: boolean;
}

export function call(command: string, args: readonly string[], options: CallOptions = {}): string {
  try {
    const output = execFileSync(command, args, {
      cwd: ROOT,
      encoding: "utf8",
      input: options.input ?? "",
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return options.raw === true ? output : output.trim();
  } catch (error) {
    const failed = FailedCallSchema.safeParse(error);
    const reason = failed.success ? failed.data.stderr.trim().split("\n").at(-1) : undefined;
    throw new ReleaseError(
      `${command} ${args.slice(0, 2).join(" ")} failed: ${reason ?? "no error output"}`,
      { cause: error },
    );
  }
}

export function git(...args: readonly string[]): string {
  return call("git", args);
}

export function remoteTags(): readonly ReleaseTag[] {
  const commits = new Map<string, string>();
  for (const line of git("ls-remote", "--tags", "origin", `refs/tags/${TAG_PREFIX}*`).split("\n")) {
    const [commit, ref] = line.split("\t");
    const [, name, peeled] = TAG_REF.exec(ref ?? "") ?? [];
    if (
      commit !== undefined &&
      name !== undefined &&
      (peeled !== undefined || !commits.has(name))
    ) {
      commits.set(name, commit);
    }
  }
  return [...commits].flatMap(([name, commit]) => {
    const version = parseVersion(name.slice(TAG_PREFIX.length));
    return name.startsWith(TAG_PREFIX) && version !== undefined ? [{ version, commit }] : [];
  });
}

export function remoteBranch(branch: string): string | undefined {
  const line = git("ls-remote", "--heads", "origin", `refs/heads/${branch}`);
  return line === "" ? undefined : line.split("\t")[0];
}

function hasCommit(commit: string): boolean {
  return spawnSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: ROOT }).status === 0;
}

export function fetchTag(tag: ReleaseTag): void {
  if (hasCommit(tag.commit)) {
    return;
  }
  const shallow = git("rev-parse", "--is-shallow-repository") === "true";
  git(
    "fetch",
    "--quiet",
    "--no-tags",
    ...(shallow ? ["--depth=1"] : []),
    "origin",
    `refs/tags/${tagOf(tag.version)}`,
  );
}

export function migrationChanges(since: ReleaseTag, base: string): readonly string[] {
  if (!hasCommit(since.commit)) {
    throw new ReleaseError(
      `the commit of ${tagOf(since.version)} is not in this clone; run git fetch --tags origin, then run the command again`,
    );
  }
  const diff = git("diff", "--name-only", since.commit, base, "--", MIGRATION_FILES);
  return diff === "" ? [] : diff.split("\n");
}

export function fileAt(base: string, path: string): string {
  return call("git", ["show", `${base}:${path}`], { raw: true });
}
