import { IMAGE_EXTENSIONS } from "./image-type.ts";

export const FILE_LIST_LIMIT = 1000;

export class FileRefused extends Error {}

export const TEMPORARY_BYTES = 12;

const FOLDER_NAME_MAX = 255;

const FILE_NAME_MAX = FOLDER_NAME_MAX - temporaryPrefix("0".repeat(TEMPORARY_BYTES * 2)).length;

function keyPattern(nameMax: number): RegExp {
  return new RegExp(
    `^items/(?<itemId>[1-9][0-9]{0,18})/(?!\\.{1,2}$)(?<name>[A-Za-z0-9._-]{1,${nameMax}})$`,
    "u",
  );
}

const KEY = keyPattern(FILE_NAME_MAX);

const STORED_KEY = keyPattern(FOLDER_NAME_MAX);

const TEMPORARY = /^(?<folder>items\/[1-9][0-9]{0,18}\/)\.tmp-[0-9a-f]+-(?<name>.+)$/u;

const POST_TEXT = /^items\/[1-9][0-9]{0,18}\/post-[0-9]+-[0-9]+\.md$/u;

const IMAGE = new RegExp(
  `^items/[1-9][0-9]{0,18}/img-[0-9]+-[0-9]+-[0-9]+\\.(?:${Object.values(IMAGE_EXTENSIONS).join("|")})$`,
  "u",
);

const PREFIX = /^items\/(?:(?<itemId>[1-9][0-9]{0,18})\/)?$/u;

export const FILE_ROUTE = "/api/files/";

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

export interface FilePrefix {
  readonly itemId: string | null;
}

export function parseFileKey(key: string): FileKey | null {
  const { itemId, name } = KEY.exec(key)?.groups ?? {};

  return itemId === undefined || name === undefined ? null : { itemId, name };
}

export function parseStoredKey(key: string): FileKey | null {
  const final = parseFileKey(key);

  if (final !== null) return final;

  const { itemId, name } = STORED_KEY.exec(key)?.groups ?? {};

  if (itemId === undefined || name === undefined) return null;

  return TEMPORARY.test(key) && parseFileKey(finalKeyOf(key)) !== null ? { itemId, name } : null;
}

export function requireStoredKey(key: string): FileKey {
  const parsed = parseStoredKey(key);

  if (parsed === null) {
    throw new FileRefused(`${JSON.stringify(key)} is not a file key`);
  }

  return parsed;
}

export function requireFileKey(key: string): FileKey {
  const parsed = parseFileKey(key);

  if (parsed === null) {
    throw new FileRefused(`${JSON.stringify(key)} is not a file key`);
  }

  return parsed;
}

export function fileRouteOf(key: string): string {
  requireFileKey(key);

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

export function requireFilePrefix(prefix: string): FilePrefix {
  const match = PREFIX.exec(prefix);

  if (match === null) {
    throw new FileRefused(`${JSON.stringify(prefix)} is not a file prefix`);
  }

  return { itemId: match.groups?.["itemId"] ?? null };
}

export function requireListLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`A list limit is a positive integer, not ${String(limit)}`);
  }

  return Math.min(limit, FILE_LIST_LIMIT);
}
