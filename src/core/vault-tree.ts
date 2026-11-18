import { z } from "zod";

import { isSweptKey } from "./file-keys.ts";
import { VAULT_ROOT, vaultNotePath } from "./vault-paths.ts";
import { invalidVaultResponse, type vaultRequest } from "./vault-request.ts";
import type { VaultSubject } from "./vault-tables.ts";

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
    if (tree.truncated) throw invalidVaultResponse();
    const [next, ...rest] = parts;
    if (next === undefined) return tree.tree;
    const entry = tree.tree.find(({ path, type }) => path === next && type === "tree");
    return entry === undefined ? [] : at(entry.sha, rest);
  }
  return { parent, root, at: (parts: readonly string[]) => at(root, parts) };
}

export type VaultTree = Readonly<Awaited<ReturnType<typeof vaultTree>>>;

export async function vaultSubjects(tree: VaultTree): Promise<readonly VaultSubject[]> {
  const [items, topics] = await Promise.all([
    tree.at([VAULT_ROOT, "items"]),
    tree.at([VAULT_ROOT, "topics"]),
  ]);

  return [
    ...items.flatMap(({ path, type }) => {
      const subjectId = Number(path);

      return type === "tree" && /^[1-9][0-9]*$/u.test(path) && Number.isSafeInteger(subjectId)
        ? [{ kind: "item" as const, subjectId }]
        : [];
    }),
    ...topics.flatMap(({ path, type }) => {
      const subjectId = Number(/^topic-([1-9][0-9]*)\.md$/u.exec(path)?.[1]);

      return type === "blob" && Number.isSafeInteger(subjectId)
        ? [{ kind: "topic" as const, subjectId }]
        : [];
    }),
  ];
}

export async function vaultTreeFiles(tree: VaultTree, subject: VaultSubject) {
  const notePath = vaultNotePath(subject);
  const parts = notePath.split("/");
  const directory = parts.slice(0, -1);
  const prefix = directory.join("/");
  const entries = await tree.at(directory);

  return entries.flatMap(({ path: name, type, sha }) => {
    const path = `${prefix}/${name}`;
    const managed =
      path === notePath ||
      (subject.kind === "item" && isSweptKey(`items/${String(subject.subjectId)}/${name}`));

    return type === "blob" && managed ? [{ path, sha }] : [];
  });
}
