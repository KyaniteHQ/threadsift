import { createHash } from "node:crypto";
import {
  constants,
  fstatSync,
  fsyncSync,
  openSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";

import { errnoCodeOf } from "../../core/failure-log.ts";
import { VAULT_FILE_BYTES } from "../../core/vault-contract.ts";
import { VAULT_ROOT } from "../../core/vault-paths.ts";
import { VaultFailure, staleVault } from "../../core/vault-request.ts";
import type { VaultSubject } from "../../core/vault-tables.ts";
import {
  VaultFileConflict,
  type VaultChange,
  type VaultFolder,
  type VaultWrite,
} from "../../core/vault-target.ts";
import {
  type VaultEntries,
  vaultFileName,
  vaultLogMonths,
  vaultSubjects,
  vaultTreeFiles,
} from "../../core/vault-tree.ts";
import {
  type VaultDirectory,
  assertVaultDirectory,
  assertVaultWritable,
  closeVaultFd,
  inVaultDirectory,
  inVaultFolder,
  isVaultSegment,
  vaultFolderFailure,
} from "./vault-directory.ts";
import {
  RECOVERED,
  STAGING,
  WRITTEN,
  clearStaging,
  pendingName,
  recoverReceipt,
  replaceInFolder,
  settleStaging,
  stagePath,
  state,
  writtenAt,
} from "./vault-staging.ts";

const RECEIPTS = [VAULT_ROOT, WRITTEN] as const;
const WIKI_FOLDERS = ["items", "topics", "log"] as const;
const REGULAR_READ = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
const INVALID_DIRECTORY = new Set(["ELOOP", "ENOTDIR"]);

function fileSha(path: string): string {
  const fd = openSync(path, REGULAR_READ);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > VAULT_FILE_BYTES) return "";
    const bytes = readFileSync(fd);
    return createHash("sha1")
      .update(`blob ${String(bytes.length)}\0`)
      .update(bytes)
      .digest("hex");
  } finally {
    closeVaultFd(fd);
  }
}

interface Inventory {
  readonly subject?: VaultSubject;
  readonly published?: true;
}

function filesIn(
  receipts: VaultDirectory,
  destination: VaultDirectory | undefined,
  inventory: Inventory,
) {
  const paths = new Map<string, { path: string; type: string; sha: string }>();
  for (const entry of readdirSync(receipts.path, { withFileTypes: true })) {
    const path = pendingName(entry.name);
    if (entry.isDirectory()) paths.set(path, { path, type: "tree", sha: "" });
    if (
      !entry.isFile() ||
      (inventory.subject !== undefined && !vaultFileName(inventory.subject, path))
    )
      continue;
    const receipt = `${receipts.path}/${entry.name}`;
    const published =
      destination !== undefined && writtenAt(`${destination.path}/${path}`, receipt);
    if (!published && (inventory.published === true || paths.has(path))) continue;
    paths.set(path, {
      path,
      type: "blob",
      sha: published && inventory.subject !== undefined ? fileSha(receipt) : "",
    });
  }
  return [...paths.values()];
}

async function readDestination<T>(
  root: VaultDirectory,
  parts: readonly string[],
  run: (directory: VaultDirectory) => T | Promise<T>,
): Promise<T | undefined> {
  try {
    return await inVaultDirectory(root, [VAULT_ROOT, ...parts], false, run);
  } catch (error) {
    if (!INVALID_DIRECTORY.has(errnoCodeOf(error))) throw error;
    return undefined;
  }
}

function folderEntries(root: VaultDirectory, inventory: Inventory): VaultEntries {
  return {
    at: async ([, ...parts]) =>
      (await inVaultDirectory(
        root,
        [...RECEIPTS, ...parts],
        false,
        async (receipts) =>
          (await readDestination(root, parts, (directory) =>
            filesIn(receipts, directory, inventory),
          )) ?? filesIn(receipts, undefined, inventory),
      )) ?? [],
  };
}

function mirrorPath(path: string) {
  const [scope, ...parts] = path.split("/");
  const name = parts.pop();
  if (
    scope !== VAULT_ROOT ||
    name === undefined ||
    pendingName(name) !== name ||
    [...parts, name].some((part) => !isVaultSegment(part) || part === WRITTEN)
  )
    throw vaultFolderFailure("folder-path");
  return { parts, name };
}

function discardReceipt(receipts: VaultDirectory, name: string): void {
  assertVaultDirectory(receipts);
  const path = `${receipts.path}/${name}`;
  recoverReceipt(null, path);
  if (state(path)?.isFile() === true) unlinkSync(path);
  fsyncSync(receipts.fd);
}

function removeEmptyDirectory(parent: VaultDirectory, name: string): void {
  assertVaultDirectory(parent);
  try {
    rmdirSync(`${parent.path}/${name}`);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(errnoCodeOf(error))) throw error;
    return;
  }
  fsyncSync(parent.fd);
}

async function pruneItem(root: VaultDirectory, parts: readonly string[]): Promise<void> {
  const [items, id] = parts;
  if (items !== "items" || id === undefined || parts.length !== 2) return;
  await inVaultDirectory(root, [VAULT_ROOT, items], false, (parent) => {
    removeEmptyDirectory(parent, id);
  });
  await inVaultDirectory(root, [...RECEIPTS, items], false, (parent) => {
    removeEmptyDirectory(parent, id);
  });
}

async function recoverStage(root: VaultDirectory, stage: VaultDirectory): Promise<void> {
  assertVaultDirectory(stage);
  const path = stagePath(stage);
  if (path === null) {
    clearStaging(stage);
    return;
  }
  const { parts, name } = mirrorPath(path);
  const trySettle = (target?: VaultDirectory) =>
    inVaultDirectory(root, [...RECEIPTS, ...parts], false, (receipts) =>
      settleStaging({ stage, target, receipts, name }, undefined),
    ).then(
      (done) => done ?? settleStaging({ stage, target, receipts: undefined, name }, undefined),
    );
  if ((await readDestination(root, parts, trySettle)) ?? (await trySettle())) return;
  await inVaultDirectory(root, [...RECEIPTS, RECOVERED], true, (recovered) =>
    settleStaging({ stage, target: undefined, receipts: undefined, name }, recovered),
  );
}

async function applyFile(
  root: VaultDirectory,
  stage: VaultDirectory,
  file: Readonly<VaultChange>,
  current: VaultWrite["current"],
  signal: AbortSignal,
): Promise<void> {
  const { parts, name } = mirrorPath(file.path);
  if (!(await current())) throw staleVault();
  signal.throwIfAborted();
  const create = file.kind === "put";
  let written: boolean | undefined;
  try {
    written = await inVaultDirectory(root, [...RECEIPTS, ...parts], create, async (receipts) => {
      const done = await inVaultDirectory(root, [VAULT_ROOT, ...parts], create, (target) =>
        replaceInFolder(
          { stage, target, receipts, name },
          file.path,
          file.kind === "put" ? file.bytes : null,
        ),
      );
      if (done !== true && !create && stagePath(stage) === null) discardReceipt(receipts, name);
      return done;
    });
  } catch (error) {
    if (!INVALID_DIRECTORY.has(errnoCodeOf(error)) && errnoCodeOf(error) !== "EEXIST") throw error;
    written = false;
  }
  if (written === false) {
    await recoverStage(root, stage);
    if (create) throw new VaultFileConflict(file);
    await inVaultDirectory(root, [...RECEIPTS, ...parts], false, (receipts) => {
      discardReceipt(receipts, name);
    });
  }
  if (!create) await pruneItem(root, parts);
}

async function verifyFolder(root: VaultDirectory): Promise<void> {
  const mirror = await inVaultDirectory(root, [VAULT_ROOT], false, async (directory) => {
    assertVaultWritable(directory);
    await Promise.all(
      [
        ...WIKI_FOLDERS.map((part) => [part]),
        [WRITTEN],
        [WRITTEN, STAGING],
        [WRITTEN, RECOVERED],
        ...WIKI_FOLDERS.map((part) => [WRITTEN, part]),
      ].map((parts) => inVaultDirectory(directory, parts, false, assertVaultWritable)),
    );
    return true;
  });
  if (mirror === undefined) assertVaultWritable(root);
}

const FOLDER_REASONS = new Map([
  ["EACCES", "folder-permission"],
  ["EPERM", "folder-permission"],
  ["EROFS", "folder-permission"],
  ["EDQUOT", "folder-full"],
  ["ENOSPC", "folder-full"],
  ["ELOOP", "folder-path"],
  ["ENOTDIR", "folder-path"],
] as const);

async function folderOperation<Result>(run: () => Promise<Result>): Promise<Result> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof VaultFailure || error instanceof VaultFileConflict) throw error;
    const errno = errnoCodeOf(error);
    if (errno === "none") throw error;
    throw vaultFolderFailure(
      [...FOLDER_REASONS].find(([code]) => code === errno)?.[1] ?? "folder-failed",
    );
  }
}

export const vaultFolder: VaultFolder = (folder, signal) => {
  const inside = <Result>(run: (directory: VaultDirectory) => Result | Promise<Result>) =>
    folderOperation(() => {
      signal.throwIfAborted();
      return inVaultFolder(folder, run);
    });
  return {
    verify: () => inside(verifyFolder),
    subjects: () => inside((root) => vaultSubjects(folderEntries(root, {}))),
    logMonths: () => inside((root) => vaultLogMonths(folderEntries(root, { published: true }))),
    files: (subject) => inside((root) => vaultTreeFiles(folderEntries(root, { subject }), subject)),
    write: ({ files, current }) =>
      inside(async (root) => {
        if (!(await current())) throw staleVault();
        signal.throwIfAborted();
        await inVaultDirectory(root, [...RECEIPTS, STAGING], files.length > 0, async (stage) => {
          await recoverStage(root, stage);
          await files.reduce(
            (prior, file) => prior.then(() => applyFile(root, stage, file, current, signal)),
            Promise.resolve(),
          );
        });
      }),
  };
};
