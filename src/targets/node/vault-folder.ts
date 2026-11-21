import { fsyncSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";

import { errnoCodeOf } from "../../core/kernel/failure-log.ts";
import {
  VaultFileConflict,
  type VaultChange,
  type VaultFolder,
  type VaultWrite,
} from "../../core/kernel/vault-target.ts";
import { VaultFailure, vaultFailure } from "../../features/vault/core/vault-failure.ts";
import {
  ITEMS_FOLDER,
  isItemFolder,
  vaultLogMonths,
  vaultPathParts,
  vaultSubjects,
  vaultTreeFiles,
} from "../../features/vault/core/vault-paths.ts";
import {
  INVALID_DIRECTORY,
  type VaultDirectory,
  assertVaultDirectory,
  assertVaultWritable,
  inMirrorFolder,
  inVaultDirectory,
  inVaultFolder,
  isVaultSegment,
} from "./vault-directory.ts";
import {
  MANAGED_FOLDERS,
  RECOVERED_DIRECTORY,
  STAGING_DIRECTORY,
  WRITTEN,
  mirrorFolder,
  receiptFolder,
} from "./vault-folders.ts";
import { folderEntries } from "./vault-inventory.ts";
import {
  clearStaging,
  pendingName,
  recoverReceipt,
  replaceInFolder,
  settleStaging,
  stagePath,
  state,
} from "./vault-staging.ts";

function mirrorPath(path: string) {
  const split = vaultPathParts(path);
  if (
    split === null ||
    pendingName(split.name) !== split.name ||
    [...split.parts, split.name].some((part) => !isVaultSegment(part) || part === WRITTEN)
  )
    throw vaultFailure("folder-path");
  return split;
}

function discardReceipt(receipts: VaultDirectory, name: string): void {
  assertVaultDirectory(receipts);
  const path = `${receipts.path}/${name}`;
  recoverReceipt(null, path);
  assertVaultDirectory(receipts);
  if (state(path)?.isFile() === true) unlinkSync(path);
  fsyncSync(receipts.fd);
}

function removeEmptyDirectory(parent: VaultDirectory, name: string): boolean {
  assertVaultDirectory(parent);
  try {
    rmdirSync(`${parent.path}/${name}`);
  } catch (error) {
    const code = errnoCodeOf(error);
    if (code === "ENOENT") return true;
    if (!["ENOTEMPTY", "EEXIST", "ENOTDIR"].includes(code)) throw error;
    return false;
  }
  fsyncSync(parent.fd);
  return true;
}

async function pruneItem(root: VaultDirectory, parts: readonly string[]): Promise<void> {
  const [items, id] = parts;
  if (items !== ITEMS_FOLDER || id === undefined || parts.length !== 2) return;
  await inVaultDirectory(root, mirrorFolder([items]), false, (parent) => {
    removeEmptyDirectory(parent, id);
  });
  await inVaultDirectory(root, receiptFolder([items]), false, (parent) => {
    removeEmptyDirectory(parent, id);
  });
}

async function pruneEmptyItems(root: VaultDirectory): Promise<void> {
  await inMirrorFolder(root, [ITEMS_FOLDER], (mirror) =>
    inVaultDirectory(root, receiptFolder([ITEMS_FOLDER]), false, (receipts) => {
      for (const entry of readdirSync(receipts.path, { withFileTypes: true })) {
        const { name } = entry;
        if (!entry.isDirectory() || !isItemFolder(name)) continue;
        if (readdirSync(`${receipts.path}/${name}`).length > 0) continue;
        if (removeEmptyDirectory(mirror, name)) removeEmptyDirectory(receipts, name);
      }
    }),
  );
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
    inVaultDirectory(root, receiptFolder(parts), false, (receipts) =>
      settleStaging({ stage, target, receipts, name }, undefined),
    ).then(
      (done) => done ?? settleStaging({ stage, target, receipts: undefined, name }, undefined),
    );
  if (!((await inMirrorFolder(root, parts, trySettle)) ?? (await trySettle())))
    await inVaultDirectory(root, RECOVERED_DIRECTORY, true, (recovered) =>
      settleStaging({ stage, target: undefined, receipts: undefined, name }, recovered),
    );
  await pruneItem(root, parts);
  clearStaging(stage);
}

async function applyFile(
  root: VaultDirectory,
  stage: VaultDirectory,
  file: Readonly<VaultChange>,
  current: VaultWrite["current"],
  signal: AbortSignal,
): Promise<void> {
  const { parts, name } = mirrorPath(file.path);
  if (!(await current())) throw vaultFailure("stale");
  signal.throwIfAborted();
  const create = file.kind === "put";
  let written: boolean | undefined;
  try {
    written = await inVaultDirectory(root, receiptFolder(parts), create, async (receipts) => {
      const done = await inVaultDirectory(root, mirrorFolder(parts), create, (target) =>
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
    await inVaultDirectory(root, receiptFolder(parts), false, (receipts) => {
      discardReceipt(receipts, name);
    });
  }
  if (!create) await pruneItem(root, parts);
  if (written === true) clearStaging(stage);
}

async function verifyFolder(root: VaultDirectory): Promise<void> {
  const mirror = await inVaultDirectory(root, mirrorFolder([]), false, async (directory) => {
    assertVaultWritable(directory);
    await Promise.all(
      MANAGED_FOLDERS.map((parts) =>
        inVaultDirectory(directory, parts, false, assertVaultWritable),
      ),
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
    throw vaultFailure(
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
    subjects: () =>
      inside(async (root) => {
        await pruneEmptyItems(root);
        return vaultSubjects(folderEntries(root, {}));
      }),
    logMonths: () => inside((root) => vaultLogMonths(folderEntries(root, { published: true }))),
    files: (subject) => inside((root) => vaultTreeFiles(folderEntries(root, { subject }), subject)),
    write: ({ files, current }) =>
      inside(async (root) => {
        if (!(await current())) throw vaultFailure("stale");
        signal.throwIfAborted();
        await inVaultDirectory(root, STAGING_DIRECTORY, files.length > 0, async (stage) => {
          await recoverStage(root, stage);
          await files.reduce(
            (prior, file) => prior.then(() => applyFile(root, stage, file, current, signal)),
            Promise.resolve(),
          );
        });
      }),
  };
};
