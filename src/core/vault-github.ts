import { z } from "zod";

import { toBase64 } from "./encoding.ts";
import type { Network } from "./network.ts";
import type { GithubVaultInput } from "./vault-contract.ts";
import { vaultLogMonths, vaultSubjects, vaultTreeFiles } from "./vault-paths.ts";
import { vaultRequest } from "./vault-request.ts";
import type { VaultChange, VaultTarget } from "./vault-target.ts";
import { VaultRefSchema, vaultTree, type VaultTree } from "./vault-tree.ts";

const CommitSchema = z.object({
  data: z.object({ createCommitOnBranch: z.object({ commit: z.object({ oid: z.string() }) }) }),
});
const COMMIT =
  "mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }";

function commitBody(
  input: Readonly<GithubVaultInput>,
  parent: string,
  files: readonly VaultChange[],
): string {
  return JSON.stringify({
    query: COMMIT,
    variables: {
      input: {
        branch: { repositoryNameWithOwner: input.repository, branchName: input.branch },
        expectedHeadOid: parent,
        message: { headline: "Update Threadsift vault notes" },
        fileChanges: {
          additions: files.flatMap((file) =>
            file.kind === "put" ? [{ path: file.path, contents: toBase64(file.bytes) }] : [],
          ),
          deletions: files.flatMap((file) => (file.kind === "delete" ? [{ path: file.path }] : [])),
        },
      },
    },
  });
}

export function vaultGithub(
  network: Network,
  input: Readonly<GithubVaultInput>,
  signal: AbortSignal,
): VaultTarget {
  const request = vaultRequest(network, input, signal);
  let snapshot: Promise<VaultTree> | null = null;
  const treeOf = () => {
    snapshot ??= vaultTree(request, input.branch);
    return snapshot;
  };
  return {
    verify: async () => {
      await request.read(`/git/ref/heads/${encodeURIComponent(input.branch)}`, VaultRefSchema);
    },
    subjects: async () => vaultSubjects(await treeOf()),
    logMonths: async () => vaultLogMonths(await treeOf()),
    files: async (subject) => vaultTreeFiles(await treeOf(), subject),
    write: async (operation) => {
      if (operation.files.length === 0) return;
      const base = await treeOf();
      await request.mutate({
        schema: CommitSchema,
        current: operation.current,
        body: commitBody(input, base.parent, operation.files),
      });
      snapshot = null;
    },
  };
}
