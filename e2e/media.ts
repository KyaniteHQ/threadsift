import { type APIRequestContext, expect } from "@playwright/test";
import { z } from "zod";

import type { Instance } from "./access.ts";

const MediaRows = z.array(
  z.object({
    id: z.number(),
    kind: z.enum(["image", "video"]),
    source_url: z.string(),
    final_url: z.string().nullable(),
    position: z.number(),
    outcome: z.enum(["stored", "failed", "linked"]),
    reason: z.string().nullable(),
    file_key: z.string().nullable(),
    content_type: z.string().nullable(),
    size: z.number().nullable(),
  }),
);

export type MediaRow = z.infer<typeof MediaRows>[number];

export const MAX_IMAGES = 20;

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const FILE_ROUTE = "/api/files/";

const FILE_HEADERS = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "cross-origin-resource-policy": "same-origin",
  "content-security-policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
} as const;

const EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

const SIGNATURES: readonly (readonly [string, (bytes: Buffer) => boolean])[] = [
  ["image/png", (bytes) => bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))],
  ["image/jpeg", (bytes) => bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))],
  ["image/gif", (bytes) => /^GIF8[79]a/u.test(bytes.subarray(0, 6).toString("latin1"))],
  [
    "image/webp",
    (bytes) =>
      bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
      bytes.subarray(8, 12).toString("latin1") === "WEBP",
  ],
  [
    "image/avif",
    (bytes) =>
      bytes.subarray(4, 8).toString("latin1") === "ftyp" &&
      /avi[fs]/u.test(bytes.subarray(8, 32).toString("latin1")),
  ],
];

export function mediaOf(instance: Instance, id: number): MediaRow[] {
  return instance.query(
    `SELECT id, kind, source_url, final_url, position, outcome, reason, file_key, content_type, size FROM media WHERE item_id = ${id} ORDER BY kind, position`,
    MediaRows,
  );
}

export function imageRows(instance: Instance, id: number): MediaRow[] {
  return mediaOf(instance, id).filter(({ kind }) => kind === "image");
}

export function videoRows(instance: Instance, id: number): MediaRow[] {
  return mediaOf(instance, id).filter(({ kind }) => kind === "video");
}

export function storedKeys(rows: readonly MediaRow[]): string[] {
  return rows.flatMap(({ file_key }) => (file_key === null ? [] : [file_key])).toSorted();
}

export function imageFiles(instance: Instance, id: number): string[] {
  return instance
    .listFiles(`items/${id}/img-`)
    .map(({ key }) => key)
    .toSorted();
}

export function routesIn(text: string | null): string[] {
  return (text ?? "").match(/\/api\/files\/items\/\d+\/[\w.-]+/gu) ?? [];
}

export function routeOf(key: string): string {
  return `${FILE_ROUTE}${key}`;
}

export function expectOwnBytes(row: Readonly<MediaRow>, bytes: Buffer | null): void {
  expect(bytes, `the file ${row.file_key ?? "-"} of a stored row`).not.toBeNull();
  expect(bytes?.length, "the stored size").toBe(row.size);

  const signature = SIGNATURES.find(([type]) => type === row.content_type);

  expect(signature?.[1](bytes ?? Buffer.alloc(0)), `bytes of ${row.content_type ?? "?"}`).toBe(
    true,
  );
  expect(row.file_key?.endsWith(`.${EXTENSIONS.get(row.content_type ?? "") ?? "?"}`)).toBe(true);
}

export function expectPrivate(response: { headers(): Record<string, string> }): void {
  for (const [name, value] of Object.entries(FILE_HEADERS)) {
    expect(response.headers()[name], name).toBe(value);
  }
}

export async function expectServed(
  request: APIRequestContext,
  instance: Instance,
  row: Readonly<MediaRow>,
  headers?: Readonly<Record<string, string>>,
): Promise<void> {
  const key = row.file_key ?? "";
  const response = await request.get(routeOf(key), headers === undefined ? {} : { headers });

  expect(response.status(), `GET ${routeOf(key)}`).toBe(200);
  expect(response.headers()["content-type"]).toBe(row.content_type);
  expect(response.headers()["content-length"]).toBe(String(row.size));
  expect(response.headers()["content-disposition"]).toBe(
    `inline; filename="image-${row.id}.${EXTENSIONS.get(row.content_type ?? "") ?? "?"}"`,
  );

  expectPrivate(response);

  expect((await response.body()).equals(instance.readFile(key) ?? Buffer.alloc(0))).toBe(true);
}
