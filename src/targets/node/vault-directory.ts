import {
  accessSync,
  closeSync,
  fsyncSync,
  constants,
  mkdirSync,
  openSync,
  readlinkSync,
} from "node:fs";

import { errnoCodeOf, reportFailure } from "../../core/failure-log.ts";
import { VaultFailure } from "../../core/vault-request.ts";

const DIRECTORY = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;

export interface VaultDirectory {
  readonly fd: number;
  readonly path: string;
  readonly location: string;
}

function descriptor(fd: number): string {
  return `/proc/self/fd/${String(fd)}`;
}

export function vaultFolderFailure(reason: Extract<VaultFailure["reason"], `folder-${string}`>) {
  return new VaultFailure({ reason, until: null, status: null });
}

function openDirectory(parent: VaultDirectory, part: string, create: boolean): number | undefined {
  const path = `${parent.path}/${part}`;
  try {
    return openSync(path, DIRECTORY);
  } catch (error) {
    if (errnoCodeOf(error) !== "ENOENT") throw error;
    if (!create) return undefined;
  }
  try {
    assertVaultDirectory(parent);
    mkdirSync(path);
    fsyncSync(parent.fd);
  } catch (error) {
    if (errnoCodeOf(error) !== "EEXIST") throw error;
  }
  return openSync(path, DIRECTORY);
}

export function closeVaultFd(fd: number): void {
  try {
    closeSync(fd);
  } catch (error) {
    reportFailure({ event: "vault-folder-close-failed", fields: {} }, error);
  }
}

export function isVaultSegment(part: string): boolean {
  return (
    part !== "." && part !== ".." && part !== "" && !part.includes("/") && !part.includes("\\")
  );
}

export async function inVaultDirectory<Result>(
  root: VaultDirectory,
  parts: readonly string[],
  create: boolean,
  run: (directory: VaultDirectory) => Result | Promise<Result>,
): Promise<Result | undefined> {
  const [part, ...rest] = parts;
  if (part === undefined) return run(root);
  if (!isVaultSegment(part)) throw vaultFolderFailure("folder-permission");
  const fd = openDirectory(root, part, create);
  if (fd === undefined) return undefined;
  try {
    const location = root.location === "/" ? `/${part}` : `${root.location}/${part}`;
    return await inVaultDirectory({ fd, path: descriptor(fd), location }, rest, create, run);
  } finally {
    closeVaultFd(fd);
  }
}

export async function inVaultFolder<Result>(
  folder: string,
  run: (directory: VaultDirectory) => Result | Promise<Result>,
): Promise<Result> {
  if (!folder.startsWith("/")) throw vaultFolderFailure("folder-permission");
  const fd = openSync("/", DIRECTORY);
  try {
    const result = await inVaultDirectory(
      { fd, path: descriptor(fd), location: "/" },
      folder.split("/").filter(Boolean),
      false,
      async (directory) => ({ value: await run(directory) }),
    );
    if (result === undefined) throw vaultFolderFailure("folder-missing");
    return result.value;
  } finally {
    closeVaultFd(fd);
  }
}

export function assertVaultDirectory(directory: VaultDirectory): void {
  if (readlinkSync(directory.path) !== directory.location)
    throw vaultFolderFailure("folder-permission");
}

export function assertVaultWritable(directory: VaultDirectory): void {
  accessSync(directory.path, constants.W_OK | constants.X_OK);
}
