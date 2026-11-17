import { z } from "zod";

import type { Network } from "./ports.ts";
import type { VaultInput } from "./vault-contract.ts";
import { vaultRequest } from "./vault-request.ts";
import { isVaultItemFile, VaultRefSchema, vaultTree, type VaultTree } from "./vault-tree.ts";

export type VaultFile = Readonly<{ path: string; subjectId: number }> &
  (
    | Readonly<{ kind: "binary"; key: string; size: number }>
    | Readonly<{ kind: "text"; content: string }>
    | Readonly<{ kind: "delete"; content: null }>
  );

export interface VaultProgress {
  readonly path: string;
  readonly subjectId: number;
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
        message: { headline: "Update Threadsift Item notes" },
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
    subjects: async (): Promise<readonly number[]> => {
      const entries = await (await treeOf()).at(["Threadsift", "items"]);
      return entries
        .filter(
          ({ path, type }) =>
            type === "tree" && /^[1-9][0-9]*$/u.test(path) && Number.isSafeInteger(Number(path)),
        )
        .map(({ path }) => Number(path));
    },
    files: async (subjectId: number) => {
      const entries = await (await treeOf()).at(["Threadsift", "items", String(subjectId)]);
      return entries
        .filter(({ path, type }) => type === "blob" && isVaultItemFile(subjectId, path))
        .map(({ path, sha }) => ({ path: `Threadsift/items/${String(subjectId)}/${path}`, sha }));
    },
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
    },
  };
}
