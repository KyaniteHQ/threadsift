import { randomUUID } from "node:crypto";
import {
  constants,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

import { errnoCodeOf } from "../../core/failure-log.ts";
import { vaultFailure } from "../../core/vault-failure.ts";
import {
  assertVaultDirectories,
  assertVaultDirectory,
  closeVaultFd,
  type VaultDirectory,
} from "./vault-directory.ts";

const PENDING = ".pending";
const NEXT = "next";
const ASIDE = "aside";
const PATH = "path";
const OWNED = "owned";
const READY = "ready";

export function state(path: string) {
  return lstatSync(path, { throwIfNoEntry: false, bigint: true });
}

export function writtenAt(destination: string, receipt: string): boolean {
  const file = state(destination);
  const marker = state(receipt);
  return (
    file?.isFile() === true &&
    marker?.isFile() === true &&
    file.dev === marker.dev &&
    file.ino === marker.ino
  );
}

function linkFile(source: string, destination: string): void {
  try {
    linkSync(source, destination);
  } catch (error) {
    if (["ENOTSUP", "EXDEV", "ENOSYS", "EMLINK"].includes(errnoCodeOf(error)))
      throw vaultFailure("folder-links");
    throw error;
  }
}

function discard(path: string): void {
  if (state(path) !== undefined) unlinkSync(path);
}

export function recoverReceipt(destination: string | null, receipt: string): void {
  const pending = `${receipt}${PENDING}`;
  if (destination !== null && writtenAt(destination, pending)) renameSync(pending, receipt);
  else discard(pending);
}

function durableFile(path: string, bytes: string | Uint8Array, mode = 0o600): void {
  writeFileSync(path, bytes, { flag: "wx", flush: true, mode });
}

export function pendingName(filename: string): string {
  return filename.endsWith(PENDING) ? filename.slice(0, -PENDING.length) : filename;
}

function preserveAside(aside: string, destination: string | null): boolean {
  const file = state(aside);
  if (file === undefined) return true;
  if (destination === null || file.isDirectory()) return false;
  const held = state(destination);
  if (held !== undefined) return held.dev === file.dev && held.ino === file.ino;
  try {
    linkFile(aside, destination);
    return true;
  } catch (error) {
    if (errnoCodeOf(error) !== "EEXIST") throw error;
    return false;
  }
}

export function stagePath(stage: VaultDirectory): string | null {
  const path = `${stage.path}/${PATH}`;
  if (state(`${stage.path}/${READY}`) === undefined) return null;
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    return readFileSync(fd, "utf8");
  } finally {
    closeVaultFd(fd);
  }
}

interface Publication {
  readonly stage: VaultDirectory;
  readonly target: VaultDirectory | undefined;
  readonly receipts: VaultDirectory | undefined;
  readonly name: string;
}

function locations({ stage, target, receipts, name }: Publication) {
  return {
    aside: `${stage.path}/${ASIDE}`,
    owned: `${stage.path}/${OWNED}`,
    destination: target === undefined ? null : `${target.path}/${name}`,
    receipt: receipts === undefined ? null : `${receipts.path}/${name}`,
  };
}

export function clearStaging(stage: VaultDirectory): void {
  assertVaultDirectory(stage);
  for (const part of [ASIDE, NEXT, OWNED, READY, PATH]) discard(`${stage.path}/${part}`);
  fsyncSync(stage.fd);
}

export function settleStaging(input: Publication, recovered: VaultDirectory | undefined): boolean {
  const { stage, target, receipts } = input;
  assertVaultDirectories(stage, target, receipts);
  const { aside, owned, destination, receipt } = locations(input);
  const managed = state(owned) !== undefined || (receipt !== null && writtenAt(aside, receipt));
  if (!managed && !preserveAside(aside, destination)) {
    if (recovered === undefined) return false;
    assertVaultDirectory(recovered);
    renameSync(aside, `${recovered.path}/${randomUUID()}-${input.name}`);
    fsyncSync(recovered.fd);
  }
  if (target !== undefined) fsyncSync(target.fd);
  if (receipt !== null && receipts !== undefined) {
    recoverReceipt(destination, receipt);
    fsyncSync(receipts.fd);
  }
  clearStaging(stage);
  return true;
}

function stageBytes(
  stage: VaultDirectory,
  receipts: VaultDirectory,
  receipt: string,
  path: string,
  bytes: Uint8Array | null,
) {
  durableFile(`${stage.path}/${PATH}`, path);
  const next = `${stage.path}/${NEXT}`;
  if (bytes !== null) durableFile(next, bytes, 0o644);
  durableFile(`${stage.path}/${READY}`, "");
  fsyncSync(stage.fd);

  const pending = `${receipt}${PENDING}`;
  if (bytes !== null) {
    assertVaultDirectories(stage, receipts);
    linkFile(next, pending);
    fsyncSync(receipts.fd);
  }
  return { next, pending };
}

export function replaceInFolder(
  input: Readonly<Publication & { target: VaultDirectory; receipts: VaultDirectory }>,
  path: string,
  bytes: Uint8Array | null,
): boolean {
  const { stage, target, receipts } = input;
  const { aside, owned, destination, receipt } = locations(input);
  if (destination === null || receipt === null) throw new Error("Missing vault publication paths");
  assertVaultDirectories(stage, target, receipts);
  const held = state(destination);
  if (held !== undefined && !writtenAt(destination, receipt)) return false;

  const { next, pending } = stageBytes(stage, receipts, receipt, path, bytes);
  assertVaultDirectories(stage, target, receipts);
  if (held !== undefined) {
    try {
      renameSync(destination, aside);
    } catch (error) {
      if (errnoCodeOf(error) !== "ENOENT") throw error;
    }
    if (state(aside) !== undefined && !writtenAt(aside, receipt)) return false;
  }

  if (bytes !== null) {
    assertVaultDirectories(stage, target);
    linkFile(next, destination);
  }
  fsyncSync(target.fd);
  if (held !== undefined) {
    durableFile(owned, "");
    fsyncSync(stage.fd);
  }
  if (bytes === null) discard(receipt);
  else renameSync(pending, receipt);
  fsyncSync(receipts.fd);
  clearStaging(stage);
  return true;
}
