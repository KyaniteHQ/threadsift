import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";

import { z } from "zod";

import { errnoCodeOf } from "../src/core/kernel/failure-log.ts";
import {
  CEILING,
  type Caps,
  FIELD_NAMES,
  LATER_PROBES,
  MICROS_PER_USD,
  POST_ID_COUNT,
  PROBES,
  type ProbeInput,
  usd,
} from "./x-api-probe-plan.ts";

export class Refusal extends Error {}

export type Mode =
  | { readonly kind: "dry" }
  | { readonly kind: "live"; readonly token: string; readonly runsDir: string };

export type Config = { readonly input: ProbeInput; readonly caps: Caps; readonly mode: Mode };

function variable(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value === undefined || value === "" ? undefined : value;
}

function required(name: string, hint: string): string {
  const value = variable(name);

  if (value === undefined) throw new Refusal(`${name} is not set: ${hint}`);
  return value;
}

function postIds(probe: ProbeInput["probe"]): readonly string[] {
  const ids = required("X_API_POST_IDS", "give the post ids the probe reads, comma-separated")
    .split(",")
    .map((id) => id.trim());

  if (ids.length !== POST_ID_COUNT[probe] || ids.some((id) => !/^\d{1,19}$/u.test(id)))
    throw new Refusal(
      `X_API_POST_IDS must hold ${POST_ID_COUNT[probe]} numeric post ids for ${probe}`,
    );
  return ids;
}

function probeInputOf(): ProbeInput {
  const name = required("X_API_PROBE", `name one probe, ${PROBES.join(", ")}`);
  const probe = z.enum(PROBES).safeParse(name);

  if (!probe.success)
    throw new Refusal(`X_API_PROBE is ${name}, not a probe; the probes are ${PROBES.join(", ")}`);
  const known = probe.data;

  if (known === "S4" || known === "S5" || known === "S6" || known === "S7")
    throw new Refusal(
      `probe ${known} belongs to roadmap item ${LATER_PROBES[known]}, which defines it; this task runs S1, S2 and S3`,
    );
  const [first = "", second = "", third = ""] = postIds(known);

  switch (known) {
    case "S1":
      return { probe: known, postId: first };
    case "S2": {
      const names = z
        .enum(FIELD_NAMES)
        .safeParse(required("X_API_FIELD_NAMES", "give the names probe S1 found: tweet or post"));

      if (!names.success) throw new Refusal("X_API_FIELD_NAMES must be tweet or post");
      return { probe: known, plainId: first, expandedId: second, names: names.data };
    }
    case "S3":
      return { probe: known, deletedId: first, protectedId: second, suspendedId: third };
    default:
      return known satisfies never;
  }
}

function capsOf(): Caps {
  const usdText = required(
    "X_API_CAP_USD",
    `give the most this run may spend, at most ${usd(CEILING.usdMicros)}`,
  );
  const postsText = required(
    "X_API_CAP_POSTS",
    `give the most posts this run may read, at most ${CEILING.posts}`,
  );
  const usdMatch = /^(?<whole>\d{1,3})(?:\.(?<fraction>\d{1,6}))?$/u.exec(usdText);

  if (usdMatch?.groups?.["whole"] === undefined)
    throw new Refusal("X_API_CAP_USD must be a number of US dollars, such as 0.20");
  if (!/^\d{1,4}$/u.test(postsText))
    throw new Refusal("X_API_CAP_POSTS must be a whole number of posts, such as 20");
  const fraction = (usdMatch.groups["fraction"] ?? "").padEnd(6, "0");
  const caps = {
    usdMicros: Number(usdMatch.groups["whole"]) * MICROS_PER_USD + Number(fraction),
    posts: Number(postsText),
  };

  if (caps.usdMicros > CEILING.usdMicros)
    throw new Refusal(
      `X_API_CAP_USD is ${usdText}, above the ceiling of ${usd(CEILING.usdMicros)} USD a run`,
    );
  if (caps.posts > CEILING.posts)
    throw new Refusal(
      `X_API_CAP_POSTS is ${postsText}, above the ceiling of ${CEILING.posts} posts a run`,
    );
  return caps;
}

function nearestExisting(path: string) {
  const rest: string[] = [];
  let folder = path;

  while (!existsSync(folder)) {
    rest.unshift(basename(folder));
    folder = dirname(folder);
  }
  return { folder: realpathSync(folder), rest };
}

function git(folder: string, args: readonly string[]) {
  const result = spawnSync("git", ["-C", folder, ...args], { encoding: "utf8" });

  if (result.error !== undefined)
    throw new Refusal(
      `git could not run (${errnoCodeOf(result.error)}), so X_API_RUNS_DIR cannot be checked`,
    );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function runsDirOf(): string {
  const raw = required(
    "X_API_RUNS_DIR",
    "give an absolute folder that git ignores or that sits outside every git work tree, such as the runs folder in the owner's private folder",
  );

  if (!isAbsolute(raw)) throw new Refusal("X_API_RUNS_DIR must be an absolute path");
  const { folder, rest } = nearestExisting(raw);
  const runsDir = join(folder, ...rest);
  const where = git(folder, ["rev-parse", "--is-inside-git-dir", "--is-inside-work-tree"]);

  if (where.status !== 0) {
    if (where.stderr.includes("not a git repository")) return runsDir;
    throw new Refusal("git could not tell whether X_API_RUNS_DIR is inside a work tree");
  }
  const [insideGitDir, insideWorkTree] = where.stdout.trim().split("\n");

  if (insideGitDir !== "false") throw new Refusal("X_API_RUNS_DIR is inside a .git folder");
  if (insideWorkTree !== "true") return runsDir;
  const ignored = git(folder, ["check-ignore", "--quiet", "--", join(runsDir, "run")]);

  if (ignored.status === 0) return runsDir;
  if (ignored.status === 1)
    throw new Refusal(
      "X_API_RUNS_DIR is inside a git work tree and git does not ignore it; use the owner's private folder or a folder outside every checkout",
    );
  throw new Refusal("git could not tell whether X_API_RUNS_DIR is ignored");
}

function modeOf(): Mode {
  if (variable("X_API_DRY_RUN") === "1") return { kind: "dry" };
  const token = required(
    "X_API_BEARER_TOKEN",
    "set it from the owner's secret store in this shell's environment only",
  );

  if (/\s/u.test(token)) throw new Refusal("X_API_BEARER_TOKEN holds whitespace");
  return { kind: "live", token, runsDir: runsDirOf() };
}

export function configOf(): Config {
  const input = probeInputOf();
  const caps = capsOf();

  return { input, caps, mode: modeOf() };
}
