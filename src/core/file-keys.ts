import { IMAGE_EXTENSIONS } from "./image-type.ts";

export const FILE_LIST_LIMIT = 1000;

export const ITEM_FILES_ROOT = "items/";

export const EXPORT_FILES_ROOT = "exports/";

export const RESTORE_FILES_ROOT = "restores/";

export class FileRefused extends Error {}

export const TEMPORARY_BYTES = 12;

const FOLDER_NAME_MAX = 255;

const FILE_NAME_MAX = FOLDER_NAME_MAX - temporaryPrefix("0".repeat(TEMPORARY_BYTES * 2)).length;

const OWNER_ID = "[1-9][0-9]{0,18}";

const EXPORT_NAME = /^(?:(?:part|dir)-[1-9][0-9]{0,9}-[0-9]{1,10}|tail-[0-9]{1,10})$/u;

const RESTORE_NAME = /^part-[1-9][0-9]{0,9}$/u;

function keyPattern(nameMax: number): RegExp {
  return new RegExp(
    `^(?<root>${ITEM_FILES_ROOT}|${EXPORT_FILES_ROOT}|${RESTORE_FILES_ROOT})(?<ownerId>${OWNER_ID})/(?!\\.{1,2}$)(?<name>[A-Za-z0-9._-]{1,${nameMax}})$`,
    "u",
  );
}

const KEY = keyPattern(FILE_NAME_MAX);

const STORED_KEY = keyPattern(FOLDER_NAME_MAX);

const TEMPORARY = new RegExp(
  `^(?<folder>(?:${ITEM_FILES_ROOT}|${EXPORT_FILES_ROOT}|${RESTORE_FILES_ROOT})${OWNER_ID}/)\\.tmp-[0-9a-f]+-(?<name>.+)$`,
  "u",
);

const POST_TEXT = new RegExp(`^${ITEM_FILES_ROOT}[1-9][0-9]{0,18}/post-[0-9]+-[0-9]+\\.md$`, "u");

const IMAGE = new RegExp(
  `^${ITEM_FILES_ROOT}[1-9][0-9]{0,18}/img-[0-9]+-[0-9]+-[0-9]+\\.(?:${Object.values(IMAGE_EXTENSIONS).join("|")})$`,
  "u",
);

const PREFIX = new RegExp(
  `^(?<root>${ITEM_FILES_ROOT}|${EXPORT_FILES_ROOT}|${RESTORE_FILES_ROOT})(?:(?<ownerId>${OWNER_ID})/)?$`,
  "u",
);

const OWNER_ID_ONLY = new RegExp(`^${OWNER_ID}$`, "u");

export const FILE_ROUTE = "/api/files/";

export function itemFilesPrefix(itemId: number | string): string {
  return `${ITEM_FILES_ROOT}${itemId}/`;
}

export function itemFileKey(itemId: number | string, name: string): string {
  return `${itemFilesPrefix(itemId)}${name}`;
}

export function temporaryPrefix(random: string): string {
  return `.tmp-${random}-`;
}

export function finalKeyOf(key: string): string {
  const { folder, name } = TEMPORARY.exec(key)?.groups ?? {};

  return folder === undefined || name === undefined ? key : folder + name;
}

export function isSweptKey(key: string): boolean {
  return POST_TEXT.test(key) || IMAGE.test(key);
}

export interface FileKey {
  readonly itemId: string;
  readonly name: string;
}

export type StoreRoot = "items" | "exports" | "restores";

export const STORE_ROOT_PREFIX = {
  items: ITEM_FILES_ROOT,
  exports: EXPORT_FILES_ROOT,
  restores: RESTORE_FILES_ROOT,
} as const satisfies Readonly<Record<StoreRoot, string>>;

export interface StoreKey {
  readonly root: StoreRoot;
  readonly ownerId: string;
  readonly name: string;
}

export interface StorePrefix {
  readonly root: StoreRoot;
  readonly ownerId: string | null;
}

function storeRootOf(root: string): StoreRoot | null {
  if (root === ITEM_FILES_ROOT) return "items";

  if (root === EXPORT_FILES_ROOT) return "exports";

  return root === RESTORE_FILES_ROOT ? "restores" : null;
}

function storeKeyOf(pattern: Readonly<RegExp>, key: string): StoreKey | null {
  const { root, ownerId, name } = pattern.exec(key)?.groups ?? {};
  const kind = root === undefined ? null : storeRootOf(root);

  if (kind === null || ownerId === undefined || name === undefined) return null;

  return { root: kind, ownerId, name };
}

function named(parsed: Readonly<StoreKey> | null): StoreKey | null {
  if (parsed?.root === "exports") return EXPORT_NAME.test(parsed.name) ? parsed : null;

  if (parsed?.root === "restores") return RESTORE_NAME.test(parsed.name) ? parsed : null;

  return parsed;
}

function storedKeyOf(key: string): StoreKey | null {
  const final = named(storeKeyOf(KEY, key));

  if (final !== null) return final;

  const stored = storeKeyOf(STORED_KEY, key);

  if (stored === null) return null;

  return TEMPORARY.test(key) && named(storeKeyOf(KEY, finalKeyOf(key))) !== null ? stored : null;
}

export function exportFilesPrefix(exportId: number | string): string {
  return `${EXPORT_FILES_ROOT}${exportId}/`;
}

export function exportFileKey(exportId: number | string, name: string): string {
  return `${exportFilesPrefix(exportId)}${name}`;
}

export function restoreFilesPrefix(restoreId: number | string): string {
  return `${RESTORE_FILES_ROOT}${restoreId}/`;
}

export function restorePartKey(restoreId: number | string, part: number): string {
  return `${restoreFilesPrefix(restoreId)}part-${String(part)}`;
}

export function parseFileKey(key: string): FileKey | null {
  const parsed = storeKeyOf(KEY, key);

  return parsed?.root === "items" ? { itemId: parsed.ownerId, name: parsed.name } : null;
}

export function parseStoredKey(key: string): StoreKey | null {
  return storedKeyOf(key);
}

export function requireStoredKey(key: string): StoreKey {
  const parsed = storedKeyOf(key);

  if (parsed === null) {
    throw new FileRefused(`${JSON.stringify(key)} is not a file key`);
  }

  return parsed;
}

export function requireFileKey(key: string): StoreKey {
  const parsed = named(storeKeyOf(KEY, key));

  if (parsed === null) {
    throw new FileRefused(`${JSON.stringify(key)} is not a file key`);
  }

  return parsed;
}

export function fileRouteOf(key: string): string {
  if (parseFileKey(key) === null) {
    throw new FileRefused(`${JSON.stringify(key)} is not a file key`);
  }

  return FILE_ROUTE + key;
}

export function keyOfFileRoute(path: string): string | null {
  const key = path.startsWith(FILE_ROUTE) ? path.slice(FILE_ROUTE.length) : "";

  return parseFileKey(key) === null ? null : key;
}

export function isImageRouteOf(path: string, itemId: number): boolean {
  const key = keyOfFileRoute(path);

  return key !== null && IMAGE.test(key) && parseFileKey(key)?.itemId === String(itemId);
}

export function isOwnerId(id: string): boolean {
  return OWNER_ID_ONLY.test(id);
}

export function requireFilePrefix(prefix: string): StorePrefix {
  const { root, ownerId } = PREFIX.exec(prefix)?.groups ?? {};
  const kind = root === undefined ? null : storeRootOf(root);

  if (kind === null) {
    throw new FileRefused(`${JSON.stringify(prefix)} is not a file prefix`);
  }

  return { root: kind, ownerId: ownerId ?? null };
}

export function requireListLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`A list limit is a positive integer, not ${String(limit)}`);
  }

  return Math.min(limit, FILE_LIST_LIMIT);
}
