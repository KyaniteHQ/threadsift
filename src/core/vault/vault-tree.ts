import { z } from "zod";

import { vaultFailure } from "./vault-failure.ts";
import type { vaultRequest } from "./vault-request.ts";

export const VaultShaSchema = z.object({ sha: z.string().regex(/^[\da-f]{40}$/u) });
export const VaultRefSchema = z.object({ object: VaultShaSchema });
const CommitSchema = z.object({ tree: VaultShaSchema });
const TreeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(z.object({ path: z.string(), type: z.string(), sha: z.string() })),
});

type Request = Readonly<ReturnType<typeof vaultRequest>>;

export async function vaultTree(request: Request, branch: string) {
  const parent = (
    await request.read(`/git/ref/heads/${encodeURIComponent(branch)}`, VaultRefSchema)
  ).object.sha;
  const root = (await request.read(`/git/commits/${parent}`, CommitSchema)).tree.sha;
  const trees = new Map<string, Promise<z.infer<typeof TreeSchema>>>();
  const read = (sha: string) => {
    const held = trees.get(sha);
    if (held !== undefined) return held;
    const pending = request.read(`/git/trees/${sha}`, TreeSchema);
    trees.set(sha, pending);
    return pending;
  };
  async function at(
    sha: string,
    parts: readonly string[],
  ): Promise<z.infer<typeof TreeSchema>["tree"]> {
    const tree = await read(sha);
    if (tree.truncated) throw vaultFailure("invalid-response");
    const [next, ...rest] = parts;
    if (next === undefined) return tree.tree;
    const entry = tree.tree.find(({ path, type }) => path === next && type === "tree");
    return entry === undefined ? [] : at(entry.sha, rest);
  }
  return { parent, root, at: (parts: readonly string[]) => at(root, parts) };
}

export type VaultTree = Readonly<Awaited<ReturnType<typeof vaultTree>>>;
