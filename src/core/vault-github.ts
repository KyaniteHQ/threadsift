import { z } from "zod";

import type { Network } from "./ports.ts";
import type { VaultInput } from "./vault-contract.ts";
import { vaultRequest } from "./vault-request.ts";
import type { VaultKind, VaultSubject } from "./vault-tables.ts";
import {
  VaultRefSchema,
  vaultLogMonths,
  vaultSubjects,
  vaultTree,
  vaultTreeFiles,
  type VaultTree,
} from "./vault-tree.ts";

export type VaultFile = Readonly<{ path: string }> &
  (
    | Readonly<{ kind: "binary"; key: string; size: number }>
    | Readonly<{ kind: "memory"; bytes: Uint8Array }>
    | Readonly<{ kind: "delete" }>
  );

export interface VaultProgress {
  readonly path: string;
  readonly subjectId: number;
  readonly noteKind: VaultKind;
  readonly sequence: number;
  readonly sha: string | null;
}

export type VaultChange = VaultProgress &
  (Readonly<{ kind: "put"; contents: string }> | Readonly<{ kind: "delete" }>);

const CommitSchema = z.object({
  data: z.object({ createCommitOnBranch: z.object({ commit: z.object({ oid: z.string() }) }) }),
});
const COMMIT =
  "mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }";

function commitBody(
  input: Readonly<VaultInput>,
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
            file.kind === "put" ? [{ path: file.path, contents: file.contents }] : [],
          ),
          deletions: files.flatMap((file) => (file.kind === "delete" ? [{ path: file.path }] : [])),
        },
      },
    },
  });
}

export function vaultGithub(network: Network, input: Readonly<VaultInput>, signal: AbortSignal) {
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
    files: async (subject: VaultSubject) => vaultTreeFiles(await treeOf(), subject),
    write: async (
      operation: Readonly<{ files: readonly VaultChange[]; current: () => Promise<boolean> }>,
    ) => {
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
