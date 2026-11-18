import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

import { errnoCodeOf, reportFailure } from "../../core/failure-log.ts";
import { VAULT_FILE_BYTES } from "../../core/vault-contract.ts";
import { vaultGithub } from "../../core/vault-github.ts";
import { VAULT_ROOT } from "../../core/vault-paths.ts";
import { VaultFailure, staleVault } from "../../core/vault-request.ts";
import type {
  VaultChange,
  VaultFolder,
  VaultTargets,
  VaultWrite,
} from "../../core/vault-target.ts";
import {
  type VaultEntries,
  vaultLogMonths,
  vaultSubjects,
  vaultTreeFiles,
} from "../../core/vault-tree.ts";
import { nodeNetwork } from "./network.ts";
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

const WRITTEN = ".written";
const PENDING = ".pending";
const REGULAR_READ = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
const NEW_FILE = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL;

function state(path: string) {
  return lstatSync(path, { throwIfNoEntry: false, bigint: true });
}

function writtenAt(destination: string, receipt: string): boolean {
  const file = state(destination);
  const marker = state(receipt);
  return (
    file?.isFile() === true &&
    marker?.isFile() === true &&
    file.dev === marker.dev &&
    file.ino === marker.ino
  );
}

function recoverReceipt(destination: string, receipt: string): void {
  const pending = `${receipt}${PENDING}`;
  if (writtenAt(destination, pending)) renameSync(pending, receipt);
  else if (state(pending)?.isFile() === true) unlinkSync(pending);
}

function publishFile(destination: string, receipt: string, bytes: Uint8Array): void {
  const exists = state(destination) !== undefined;
  if (exists && !writtenAt(destination, receipt)) throw vaultFolderFailure("folder-permission");
  const temporary = `${destination.slice(0, destination.lastIndexOf("/"))}/.threadsift-${randomUUID()}`;
  const fd = openSync(temporary, NEW_FILE, 0o644);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    const pending = `${receipt}${PENDING}`;
    linkSync(temporary, pending);
    if (exists) renameSync(temporary, destination);
    else linkSync(temporary, destination);
    renameSync(pending, receipt);
  } finally {
    closeVaultFd(fd);
    try {
      if (state(temporary) !== undefined) unlinkSync(temporary);
    } catch (error) {
      reportFailure({ event: "vault-folder-temp-cleanup-failed", fields: {} }, error);
    }
  }
}

function fileSha(path: string): string {
  const fd = openSync(path, REGULAR_READ);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw vaultFolderFailure("folder-permission");
    if (stat.size > VAULT_FILE_BYTES) return "";
    const bytes = readFileSync(fd);
    return createHash("sha1")
      .update(`blob ${String(bytes.length)}\0`)
      .update(bytes)
      .digest("hex");
  } finally {
    closeVaultFd(fd);
  }
}

function filesIn(receipts: VaultDirectory, destination: VaultDirectory | undefined, hash: boolean) {
  const entries = readdirSync(receipts.path, { withFileTypes: true });
  const paths = new Map<string, { path: string; type: string; sha: string }>();
  for (const entry of entries) {
    const path = entry.isFile() ? entry.name.replace(/\.pending$/u, "") : entry.name;
    if (entry.isDirectory()) paths.set(path, { path, type: "tree", sha: "" });
    if (!entry.isFile()) continue;
    const receipt = `${receipts.path}/${entry.name}`;
    if (destination === undefined || !writtenAt(`${destination.path}/${path}`, receipt)) continue;
    paths.set(path, { path, type: "blob", sha: hash ? fileSha(receipt) : "" });
  }
  return [...paths.values()];
}

function folderEntries(root: VaultDirectory, hash: boolean): VaultEntries {
  return {
    at: async ([, ...parts]) =>
      (await inVaultDirectory(
        root,
        [VAULT_ROOT, WRITTEN, ...parts],
        false,
        async (receipts) =>
          (await inVaultDirectory(root, [VAULT_ROOT, ...parts], false, (directory) =>
            filesIn(receipts, directory, hash),
          )) ?? filesIn(receipts, undefined, hash),
      )) ?? [],
  };
}

function mirrorPath(path: string) {
  const [scope, ...parts] = path.split("/");
  const name = parts.pop();
  if (
    scope !== VAULT_ROOT ||
    name === undefined ||
    name.endsWith(PENDING) ||
    [...parts, name].some((part) => !isVaultSegment(part) || part === WRITTEN)
  )
    throw vaultFolderFailure("folder-permission");
  return { parts, name };
}

async function applyFile(
  root: VaultDirectory,
  file: VaultChange,
  current: VaultWrite["current"],
  signal: AbortSignal,
): Promise<void> {
  const { parts, name } = mirrorPath(file.path);
  if (!(await current())) throw staleVault();
  signal.throwIfAborted();
  assertVaultDirectory(root);
  await inVaultDirectory(root, [VAULT_ROOT, ...parts], file.kind === "put", (directory) =>
    inVaultDirectory(root, [VAULT_ROOT, WRITTEN, ...parts], file.kind === "put", (receipts) => {
      signal.throwIfAborted();
      assertVaultDirectory(directory);
      assertVaultDirectory(receipts);
      const destination = `${directory.path}/${name}`;
      const receipt = `${receipts.path}/${name}`;
      recoverReceipt(destination, receipt);
      if (file.kind === "put") {
        publishFile(destination, receipt, file.bytes);
      } else {
        if (writtenAt(destination, receipt)) unlinkSync(destination);
        if (state(receipt)?.isFile() === true) unlinkSync(receipt);
      }
      return true;
    }),
  );
}

async function folderOperation<Result>(run: () => Promise<Result>): Promise<Result> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof VaultFailure) throw error;
    if (errnoCodeOf(error) === "none") throw error;
    throw vaultFolderFailure("folder-permission");
  }
}

export const vaultFolder: VaultFolder = (folder, signal) => {
  const inside = <Result>(run: (directory: VaultDirectory) => Result | Promise<Result>) =>
    folderOperation(() => {
      signal.throwIfAborted();
      return inVaultFolder(folder, run);
    });
  return {
    verify: () =>
      inside(async (root) => {
        const writable = await inVaultDirectory(root, [VAULT_ROOT], false, (directory) => {
          assertVaultWritable(directory);
          return true;
        });
        if (writable === undefined) assertVaultWritable(root);
      }),
    subjects: () => inside((root) => vaultSubjects(folderEntries(root, false))),
    logMonths: () => inside((root) => vaultLogMonths(folderEntries(root, false))),
    files: (subject) => inside((root) => vaultTreeFiles(folderEntries(root, true), subject)),
    write: async ({ files, current }) => {
      if (files.length === 0) return;
      await inside((root) =>
        files.reduce(
          (prior, file) => prior.then(() => applyFile(root, file, current, signal)),
          Promise.resolve(),
        ),
      );
    },
  };
};

export const nodeVaultTargets: VaultTargets = {
  github: (input, signal) => vaultGithub(nodeNetwork, input, signal),
  folder: vaultFolder,
};
