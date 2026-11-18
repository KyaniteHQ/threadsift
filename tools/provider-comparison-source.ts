import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { z } from "zod";

import { TASKS } from "../src/core/ai-tasks.ts";

const CONTRACT_FILES = [
  ":(top)src/core/digest-text.ts",
  ":(top)src/core/digest-prompt.ts",
  ":(top)src/core/plain-text.ts",
];

function git(args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: import.meta.dirname,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function contractChanged(
  from: string,
  to: readonly string[],
  paths: readonly string[] = CONTRACT_FILES,
): boolean {
  try {
    git(["diff", "--quiet", from, ...to, "--", ...paths]);

    return false;
  } catch {
    return true;
  }
}

export function comparisonSource() {
  return {
    revision: git(["rev-parse", "HEAD"]),
    worktreeDirty: git(["status", "--porcelain"]) !== "",
    instructions: TASKS.digest.instructions,
    schemaHash: createHash("sha256")
      .update(JSON.stringify(z.toJSONSchema(TASKS.digest.schema)))
      .digest("hex"),
  };
}

export function compatibleSource(
  snapshot?: Readonly<{ captureRevision: string; instructions: string; schemaHash: string }>,
) {
  const source = comparisonSource();

  if (contractChanged("HEAD", []) || contractChanged("HEAD", [], [":(top)src/core/ai-contract.ts"]))
    return {
      error: "Commit the Digest contract changes before capturing or running a comparison",
    } as const;
  if (snapshot === undefined) return source;
  if (contractChanged(snapshot.captureRevision, ["HEAD"]))
    return {
      error:
        "Digest contract changed or capture revision is unavailable; capture the Item list again",
    } as const;
  if (snapshot.instructions !== source.instructions || snapshot.schemaHash !== source.schemaHash)
    return { error: "Digest contract changed; capture the Item list again" } as const;

  return source;
}
