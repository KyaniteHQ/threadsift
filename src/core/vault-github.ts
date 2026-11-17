import type { JobPorts } from "./job-outcome.ts";
import type { Network } from "./ports.ts";
import { vaultBlob, type VaultBinary } from "./vault-blob.ts";
import type { VaultInput } from "./vault-contract.ts";
import { vaultRequest } from "./vault-request.ts";
import {
  isVaultItemFile,
  VaultRefSchema,
  VaultShaSchema,
  vaultTree,
  type VaultTree,
} from "./vault-tree.ts";

export type VaultFile =
  | VaultBinary
  | (Readonly<{ path: string; subjectId: number }> &
      (Readonly<{ kind: "text"; content: string }> | Readonly<{ kind: "delete"; content: null }>));

type Entry = Readonly<{ path: string; mode: "100644"; type: "blob" }> &
  (Readonly<{ content: string }> | Readonly<{ sha: string | null }>);
type Request = Readonly<ReturnType<typeof vaultRequest>>;
interface BlobContext {
  readonly ports: JobPorts;
  readonly request: Request;
  readonly sealedToken: string;
  readonly signal: AbortSignal;
}

async function entriesOf(
  context: BlobContext,
  files: readonly VaultFile[],
): Promise<readonly Entry[]> {
  const [file, ...rest] = files;
  if (file === undefined) return [];
  const entry = { path: file.path, mode: "100644", type: "blob" } as const;
  const value =
    file.kind === "text"
      ? { ...entry, content: file.content }
      : { ...entry, sha: file.kind === "delete" ? null : await vaultBlob({ ...context, file }) };
  return [value, ...(await entriesOf(context, rest))];
}

async function commitFiles(
  input: Readonly<{
    context: BlobContext;
    branch: string;
    files: readonly VaultFile[];
    current: () => Promise<boolean>;
    base: VaultTree;
  }>,
): Promise<void> {
  const { context, branch, files, current } = input;
  const base = input.base;
  const entries = await entriesOf(context, files);
  if (entries.length === 0) return;
  const created = await context.request.mutate({
    method: "post",
    path: "/git/trees",
    schema: VaultShaSchema,
    body: JSON.stringify({ base_tree: base.root, tree: entries }),
    current: null,
  });
  if (created.sha === base.root) return;
  const commit = await context.request.mutate({
    method: "post",
    path: "/git/commits",
    schema: VaultShaSchema,
    body: JSON.stringify({
      message: "Update Threadsift Item notes",
      tree: created.sha,
      parents: [base.parent],
    }),
    current: null,
  });
  await moveVaultRef({ request: context.request, branch, sha: commit.sha, current });
}

async function moveVaultRef(
  input: Readonly<{
    request: Request;
    branch: string;
    sha: string;
    current: () => Promise<boolean>;
  }>,
): Promise<void> {
  await input.request.mutate({
    method: "patch",
    path: `/git/refs/heads/${encodeURIComponent(input.branch)}`,
    schema: VaultRefSchema,
    body: JSON.stringify({ sha: input.sha, force: false }),
    current: input.current,
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
      const tree = await treeOf();
      const entries = await tree.at(["Threadsift", "items"]);
      return entries
        .filter(
          ({ path, type }) =>
            type === "tree" && /^[1-9][0-9]*$/u.test(path) && Number.isSafeInteger(Number(path)),
        )
        .map(({ path }) => Number(path));
    },
    files: async (subjectId: number): Promise<readonly string[]> => {
      const tree = await treeOf();
      const entries = await tree.at(["Threadsift", "items", String(subjectId)]);
      return entries
        .filter(({ path, type }) => type === "blob" && isVaultItemFile(subjectId, path))
        .map(({ path }) => `Threadsift/items/${String(subjectId)}/${path}`);
    },
    write: async (
      operation: Readonly<{
        ports: JobPorts;
        sealedToken: string;
        files: readonly VaultFile[];
        current: () => Promise<boolean>;
      }>,
    ) =>
      commitFiles({
        context: { ports: operation.ports, request, signal, sealedToken: operation.sealedToken },
        branch: input.branch,
        base: await treeOf(),
        files: operation.files,
        current: operation.current,
      }),
  };
}
