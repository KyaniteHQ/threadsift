import { ITEM_FILES_ROOT, isSweptKey, itemFileKey } from "../contract/file-keys.ts";
import { logMonthName } from "../kernel/vault-log-month.ts";
import type { VaultSubject } from "../kernel/vault-tables.ts";

export const VAULT_ROOT = "Threadsift";

export const ITEMS_FOLDER = ITEM_FILES_ROOT.slice(0, -1);
const TOPICS = "topics";
const LOG = "log";

export const WIKI_FOLDERS = [ITEMS_FOLDER, TOPICS, LOG] as const;

const ITEM_FOLDER = /^[1-9][0-9]*$/u;
const TOPIC_NOTE = /^topic-([1-9][0-9]*)\.md$/u;
const LOG_MONTH_NOTE = /^(\d{4})-(0[1-9]|1[0-2])\.md$/u;

export interface VaultEntry {
  readonly path: string;
  readonly type: string;
  readonly sha: string;
}

export interface VaultEntries {
  readonly at: (parts: readonly string[]) => Promise<readonly VaultEntry[]>;
}

export function vaultNotePath({ kind, subjectId }: VaultSubject): string {
  const id = String(subjectId);

  switch (kind) {
    case "item":
      return `${VAULT_ROOT}/${ITEMS_FOLDER}/${id}/note-${id}.md`;
    case "topic":
      return `${VAULT_ROOT}/${TOPICS}/topic-${id}.md`;
    case "index":
      return `${VAULT_ROOT}/Index.md`;
    case "log":
      return `${VAULT_ROOT}/Log.md`;
    case "log-month":
      return `${VAULT_ROOT}/${LOG}/${logMonthName(subjectId)}.md`;
    default:
      return kind satisfies never;
  }
}

export function vaultFilePath(key: string): string {
  return `${VAULT_ROOT}/${key}`;
}

export function vaultPathParts(path: string) {
  const [scope, ...parts] = path.split("/");
  const name = parts.pop();

  return scope === VAULT_ROOT && name !== undefined ? { parts, name } : null;
}

export async function vaultLogMonths(entries: VaultEntries): Promise<readonly number[]> {
  const files = await entries.at([VAULT_ROOT, LOG]);

  return files.flatMap(({ path, type }) => {
    const match = LOG_MONTH_NOTE.exec(path);

    return type === "blob" && match !== null ? [Number(`${match[1]}${match[2]}`)] : [];
  });
}

export async function vaultSubjects(entries: VaultEntries): Promise<readonly VaultSubject[]> {
  const [items, topics, months] = await Promise.all([
    entries.at([VAULT_ROOT, ITEMS_FOLDER]),
    entries.at([VAULT_ROOT, TOPICS]),
    vaultLogMonths(entries),
  ]);

  return [
    ...items.flatMap(({ path, type }) => {
      const subjectId = Number(path);

      return type === "tree" && ITEM_FOLDER.test(path) && Number.isSafeInteger(subjectId)
        ? [{ kind: "item" as const, subjectId }]
        : [];
    }),
    ...topics.flatMap(({ path, type }) => {
      const subjectId = Number(TOPIC_NOTE.exec(path)?.[1]);

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
    (subject.kind === "item" && isSweptKey(itemFileKey(subject.subjectId, name)))
  );
}

export async function vaultTreeFiles(entries: VaultEntries, subject: VaultSubject) {
  const directory = vaultNotePath(subject).split("/").slice(0, -1);
  const prefix = directory.join("/");
  const found = await entries.at(directory);

  return found.flatMap(({ path: name, type, sha }) => {
    const path = `${prefix}/${name}`;
    return type === "blob" && vaultFileName(subject, name) ? [{ path, sha }] : [];
  });
}
