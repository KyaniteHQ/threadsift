import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { z } from "zod";

import type { Browser } from "./extension-listing-check.ts";

export const ROOT = resolve(import.meta.dirname, "..");
export const EXTENSION = "extension";
export const WXT_OUTPUT = join(EXTENSION, ".output");

export type StoreFile = Browser | "sources";

export const STORE_FILES: readonly StoreFile[] = ["chrome", "firefox", "sources"];

const PackageSchema = z.object({ name: z.string().min(1), version: z.string().min(1) });

export interface Release {
  readonly name: string;
  readonly version: string;
}

export function extensionRelease(): Release {
  return PackageSchema.parse(
    JSON.parse(readFileSync(join(ROOT, EXTENSION, "package.json"), "utf8")),
  );
}

export function zipName({ name, version }: Release, kind: StoreFile): string {
  return `${name}-${version}-${kind}.zip`;
}

export function storeFile(release: Release, kind: StoreFile): string {
  return join(ROOT, WXT_OUTPUT, zipName(release, kind));
}
