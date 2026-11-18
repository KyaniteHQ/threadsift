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

export interface VaultEntries {
  readonly at: (
    parts: readonly string[],
  ) => Promise<readonly Readonly<{ path: string; type: string; sha: string }>[]>;
}

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

export async function vaultLogMonths(tree: VaultEntries): Promise<readonly number[]> {
  const entries = await tree.at([VAULT_ROOT, "log"]);
  return entries.flatMap(({ path, type }) => {
    const match = /^(\d{4})-(0[1-9]|1[0-2])\.md$/u.exec(path);

    return type === "blob" && match !== null ? [Number(`${match[1]}${match[2]}`)] : [];
  });
}

export async function vaultSubjects(tree: VaultEntries): Promise<readonly VaultSubject[]> {
  const [items, topics, months] = await Promise.all([
    tree.at([VAULT_ROOT, "items"]),
    tree.at([VAULT_ROOT, "topics"]),
    vaultLogMonths(tree),
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
    ...months.map((subjectId) => ({ kind: "log-month" as const, subjectId })),
  ];
}

export function vaultFileName(subject: VaultSubject, name: string): boolean {
  return (
    vaultNotePath(subject).split("/").at(-1) === name ||
    (subject.kind === "item" && isSweptKey(`items/${String(subject.subjectId)}/${name}`))
  );
}

export async function vaultTreeFiles(tree: VaultEntries, subject: VaultSubject) {
  const notePath = vaultNotePath(subject);
  const parts = notePath.split("/");
  const directory = parts.slice(0, -1);
  const prefix = directory.join("/");
  const entries = await tree.at(directory);

  return entries.flatMap(({ path: name, type, sha }) => {
    const path = `${prefix}/${name}`;
    return type === "blob" && vaultFileName(subject, name) ? [{ path, sha }] : [];
  });
}
