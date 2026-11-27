import { z } from "zod";

import { CEILING, type Caps, MICROS_PER_USD, usd } from "./x-api-probe-cost.ts";
import {
  FIELD_NAMES,
  POST_ID_COUNT,
  PROBES,
  type PlannedRequest,
  type ProbeInput,
  Refusal,
  planOf,
  runFilesOf,
} from "./x-api-probe-plan.ts";
import { runFolderOf } from "./x-api-probe-runs-dir.ts";

export type Mode =
  | { readonly kind: "dry" }
  | { readonly kind: "live"; readonly token: string; readonly runFolder: string };

export type Config = {
  readonly input: ProbeInput;
  readonly caps: Caps;
  readonly plan: readonly PlannedRequest[];
  readonly mode: Mode;
};

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
  if (new Set(ids).size !== ids.length)
    throw new Refusal(`X_API_POST_IDS must hold ${POST_ID_COUNT[probe]} different post ids`);
  return ids;
}

function probeInputOf(): ProbeInput {
  const name = required("X_API_PROBE", `name one probe, ${PROBES.join(", ")}`);
  const probe = z.enum(PROBES).safeParse(name);

  if (!probe.success)
    throw new Refusal(`X_API_PROBE is not a probe; the probes are ${PROBES.join(", ")}`);
  const known = probe.data;

  if (known === "S6" || known === "S7")
    throw new Refusal(`probe ${known} is not defined yet; this task runs S1 to S5`);
  const [first = "", second = "", third = ""] = postIds(known);

  switch (known) {
    case "S1":
      return { probe: known, postId: first };
    case "S2": {
      const names = z
        .enum(FIELD_NAMES)
        .safeParse(required("X_API_FIELD_NAMES", "give the names to send: tweet or post"));

      if (!names.success) throw new Refusal("X_API_FIELD_NAMES must be tweet or post");
      return { probe: known, plainId: first, expandedId: second, names: names.data };
    }
    case "S3":
      return { probe: known, deletedId: first, protectedId: second, suspendedId: third };
    case "S4":
    case "S5":
      return { probe: known, postId: first };
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
    throw new Refusal(`X_API_CAP_USD is above the ceiling of ${usd(CEILING.usdMicros)} USD a run`);
  if (caps.posts > CEILING.posts)
    throw new Refusal(`X_API_CAP_POSTS is above the ceiling of ${CEILING.posts} posts a run`);
  return caps;
}

function runFolderName(input: ProbeInput): string {
  const stamp = new Date()
    .toISOString()
    .replace(/\.\d+Z$/u, "Z")
    .replaceAll(":", "-");

  return `${stamp}-${input.probe}`;
}

function modeOf(input: ProbeInput, plan: readonly PlannedRequest[]): Mode {
  const dry = variable("X_API_DRY_RUN");

  if (dry === "1") return { kind: "dry" };
  if (dry !== undefined) throw new Refusal("X_API_DRY_RUN must be 1 or unset");
  const token = required(
    "X_API_BEARER_TOKEN",
    "set it from the owner's secret store in this shell's environment only",
  );

  if (/\s/u.test(token)) throw new Refusal("X_API_BEARER_TOKEN holds whitespace");
  const runsDir = required(
    "X_API_RUNS_DIR",
    "give an absolute folder that git ignores or that sits outside every git work tree, such as the runs folder in the owner's private folder",
  );

  return {
    kind: "live",
    token,
    runFolder: runFolderOf(runsDir, runFolderName(input), runFilesOf(plan)),
  };
}

export function configOf(): Config {
  const input = probeInputOf();
  const caps = capsOf();
  const plan = planOf(input);

  return { input, caps, plan, mode: modeOf(input, plan) };
}
