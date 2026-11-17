import { z } from "zod";

import type { Network } from "./ports.ts";
import type { VaultInput } from "./vault-contract.ts";
import { VaultFailure, vaultRequest } from "./vault-request.ts";
const ShaSchema = z.object({ sha: z.string().regex(/^[\da-f]{40}$/u) });
const RefSchema = z.object({ object: ShaSchema });
const CommitSchema = z.object({ tree: ShaSchema });
const TreeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(z.object({ path: z.string(), type: z.string(), sha: z.string() })),
});

export type VaultFile = Readonly<{ path: string; itemId: number }> &
  (
    | Readonly<{ kind: "text" | "binary"; content: string }>
    | Readonly<{ kind: "delete"; content: null }>
  );

function treeEntries(files: readonly VaultFile[], present: Readonly<ReadonlySet<string>>) {
  return files.flatMap<
    | Readonly<{ path: string; mode: string; type: string; sha: string | null }>
    | Readonly<{ path: string; mode: string; type: string; content: string }>
  >(({ path, content, kind }) =>
    content === null
      ? present.has(path)
        ? [{ path, mode: "100644", type: "blob", sha: null }]
        : []
      : kind === "binary"
        ? [{ path, mode: "100644", type: "blob", sha: content }]
        : [{ path, mode: "100644", type: "blob", content }],
  );
}

export function vaultGithub(network: Network, input: Readonly<VaultInput>, signal: AbortSignal) {
  const branch = encodeURIComponent(input.branch);
  const request = vaultRequest(network, input, signal);

  const tip = () => request("get", `/git/ref/heads/${branch}`, RefSchema);

  return {
    verify: async () => {
      await tip();
    },
    write: async (files: readonly VaultFile[], current: () => Promise<boolean>): Promise<void> => {
      const parent = (await tip()).object.sha;
      const base = (await request("get", `/git/commits/${parent}`, CommitSchema)).tree.sha;
      const deleting = files.filter(({ content }) => content === null);
      const tree =
        deleting.length === 0
          ? null
          : await request("get", `/git/trees/${base}?recursive=1`, TreeSchema);
      if (tree?.truncated === true) throw new VaultFailure("github-error");
      const present = new Set(tree?.tree.map(({ path }) => path));
      const entries = treeEntries(await blobFiles(request, files), present);
      if (entries.length === 0) return;
      const created = await request(
        "post",
        "/git/trees",
        ShaSchema,
        JSON.stringify({ base_tree: base, tree: entries }),
      );
      const commit = await request(
        "post",
        "/git/commits",
        ShaSchema,
        JSON.stringify({
          message: "Update Threadsift Item notes",
          tree: created.sha,
          parents: [parent],
        }),
      );
      await request(
        "patch",
        `/git/refs/heads/${branch}`,
        RefSchema,
        JSON.stringify({ sha: commit.sha, force: false }),
        current,
      );
    },
  };
}

type Request = ReturnType<typeof vaultRequest>;

async function blobFiles(
  request: Request,
  files: readonly VaultFile[],
): Promise<readonly VaultFile[]> {
  const [next, ...rest] = files;
  if (next === undefined) return [];
  if (next.kind !== "binary") return [next, ...(await blobFiles(request, rest))];
  const blob = await request(
    "post",
    "/git/blobs",
    ShaSchema,
    JSON.stringify({ content: next.content, encoding: "base64" }),
  );
  return [{ ...next, content: blob.sha }, ...(await blobFiles(request, rest))];
}
