import { CANONICAL_NUMBER_SOURCE } from "./canonical-number.ts";
import { IMAGE_EXTENSIONS } from "./image-type.ts";

export const FILE_LIST_LIMIT = 1000;

export class FileRefused extends Error {}

export const TEMPORARY_BYTES = 12;

const FOLDER_NAME_MAX = 255;

const FILE_NAME_MAX = FOLDER_NAME_MAX - temporaryPrefix("0".repeat(TEMPORARY_BYTES * 2)).length;

const OWNER_ID = CANONICAL_NUMBER_SOURCE;

const EXPORT_NAME = /^(?:(?:part|dir)-[1-9][0-9]{0,9}-[0-9]{1,10}|tail-[0-9]{1,10})$/u;

const RESTORE_NAME = /^part-[1-9][0-9]{0,9}$/u;

const ROOTS = [
  { root: "items", name: null },
  { root: "exports", name: EXPORT_NAME },
  { root: "restores", name: RESTORE_NAME },
] as const;

export type StoreRoot = (typeof ROOTS)[number]["root"];

function rootNamed(root: string | undefined) {
  return ROOTS.find((each) => each.root === root)?.root;
}

function folderOf<Root extends StoreRoot>(root: Root) {
  return `${root}/` as const;
}

export const ITEM_FILES_ROOT = folderOf("items");

export const EXPORT_FILES_ROOT = folderOf("exports");

export const RESTORE_FILES_ROOT = folderOf("restores");

const ROOT_NAMES = ROOTS.map(({ root }) => root).join("|");

function keyPattern(nameMax: number): RegExp {
  return new RegExp(
    `^(?<root>${ROOT_NAMES})/(?<ownerId>${OWNER_ID})/(?!\\.{1,2}$)(?<name>[A-Za-z0-9._-]{1,${nameMax}})$`,
    "u",
  );
}

const KEY = keyPattern(FILE_NAME_MAX);

const STORED_KEY = keyPattern(FOLDER_NAME_MAX);

const TEMPORARY = new RegExp(
  `^(?<folder>(?:${ROOT_NAMES})/${OWNER_ID}/)\\.tmp-[0-9a-f]+-(?<name>.+)$`,
  "u",
);

export const POST_TEXT_STEM = "post-";
export const IMAGE_STEM = "img-";

const POST_TEXT = new RegExp(
  `^${ITEM_FILES_ROOT}(?<itemId>${OWNER_ID})/${POST_TEXT_STEM}[0-9]+-[0-9]+\\.md$`,
  "u",
);

const IMAGE = new RegExp(
  `^${ITEM_FILES_ROOT}(?<itemId>${OWNER_ID})/${IMAGE_STEM}[0-9]+-[0-9]+-[0-9]+\\.(?:${Object.values(IMAGE_EXTENSIONS).join("|")})$`,
  "u",
);

const PREFIX = new RegExp(`^(?<root>${ROOT_NAMES})/(?:(?<ownerId>${OWNER_ID})/)?$`, "u");

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

interface ItemFile {
  readonly kind: "post-text" | "image";
  readonly itemId: string;
}

export function imageKey(prefix: string, position: number, extension: string): string {
  return `${prefix}${String(position)}.${extension}`;
}

export function itemFileOf(key: string): ItemFile | null {
  const post = POST_TEXT.exec(key)?.groups?.["itemId"];

  if (post !== undefined) return { kind: "post-text", itemId: post };

  const image = IMAGE.exec(key)?.groups?.["itemId"];

  return image === undefined ? null : { kind: "image", itemId: image };
}

export function isSweptKey(key: string): boolean {
  return itemFileOf(key) !== null;
}

interface FileKey {
  readonly itemId: string;
  readonly name: string;
}

export interface StoreKey {
  readonly root: StoreRoot;
  readonly ownerId: string;
  readonly name: string;
}

export interface StorePrefix {
  readonly root: StoreRoot;
  readonly ownerId: string | null;
}

export function storePrefixText({ root, ownerId }: Readonly<StorePrefix>): string {
  return ownerId === null ? folderOf(root) : `${folderOf(root)}${ownerId}/`;
}

export function storeKeyText(key: Readonly<StoreKey>): string {
  return `${storePrefixText(key)}${key.name}`;
}

function storeKeyOf(pattern: Readonly<RegExp>, key: string): StoreKey | null {
  const groups = pattern.exec(key)?.groups;
  const root = rootNamed(groups?.["root"]);
  const { ownerId, name } = groups ?? {};

  return root === undefined || ownerId === undefined || name === undefined
    ? null
    : { root, ownerId, name };
}

function named(parsed: Readonly<StoreKey> | null): StoreKey | null {
  const misnamed = ROOTS.some(
    ({ root, name }) => root === parsed?.root && name !== null && !name.test(parsed.name),
  );

  return misnamed ? null : parsed;
}

export function parseStoredKey(key: string): StoreKey | null {
  const final = named(storeKeyOf(KEY, key));

  if (final !== null) return final;

  const stored = storeKeyOf(STORED_KEY, key);

  if (stored === null) return null;

  return TEMPORARY.test(key) && named(storeKeyOf(KEY, finalKeyOf(key))) !== null ? stored : null;
}

export function ownerIdOf(key: string, root: StoreRoot): number | null {
  const parsed = parseStoredKey(key);
  const id = Number(parsed?.ownerId);

  return parsed?.root === root && Number.isSafeInteger(id) ? id : null;
}

export function exportFilesPrefix(exportId: number | string): string {
  return `${EXPORT_FILES_ROOT}${exportId}/`;
}

function exportFileKey(exportId: number | string, name: string): string {
  return `${exportFilesPrefix(exportId)}${name}`;
}

export type ExportPiece = "part" | "dir";

export function exportPieceKey(
  exportId: number | string,
  piece: ExportPiece,
  part: number,
  generation: number,
): string {
  return exportFileKey(exportId, `${piece}-${String(part)}-${String(generation)}`);
}

export function exportTailKey(exportId: number | string, generation: number): string {
  return exportFileKey(exportId, `tail-${String(generation)}`);
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

function refused(key: string): never {
  throw new FileRefused(`${JSON.stringify(key)} is not a file key`);
}

export function requireStoredKey(key: string): StoreKey {
  return parseStoredKey(key) ?? refused(key);
}

export function requireFileKey(key: string): StoreKey {
  return named(storeKeyOf(KEY, key)) ?? refused(key);
}

export function fileRouteOf(key: string): string {
  return parseFileKey(key) === null ? refused(key) : FILE_ROUTE + key;
}

export function keyOfFileRoute(path: string): string | null {
  const key = path.startsWith(FILE_ROUTE) ? path.slice(FILE_ROUTE.length) : "";

  return parseFileKey(key) === null ? null : key;
}

export function isImageRouteOf(path: string, itemId: number): boolean {
  const key = keyOfFileRoute(path);

  const file = key === null ? null : itemFileOf(key);

  return file?.kind === "image" && file.itemId === String(itemId);
}

export function isOwnerId(id: string): boolean {
  return OWNER_ID_ONLY.test(id);
}

export function requireFilePrefix(prefix: string): StorePrefix {
  const groups = PREFIX.exec(prefix)?.groups;
  const root = rootNamed(groups?.["root"]);

  if (root === undefined) {
    throw new FileRefused(`${JSON.stringify(prefix)} is not a file prefix`);
  }

  return { root, ownerId: groups?.["ownerId"] ?? null };
}

export function requireListLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`A list limit is a positive integer, not ${String(limit)}`);
  }

  return Math.min(limit, FILE_LIST_LIMIT);
}
