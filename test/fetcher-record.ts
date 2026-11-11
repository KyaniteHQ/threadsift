import { realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { z } from "zod";

export async function recordOf(file: string, name: "asked" | "calls"): Promise<readonly string[]> {
  const namespace: unknown = await import(pathToFileURL(await realpath(file)).href);

  return z.object({ [name]: z.array(z.string()) }).parse(namespace)[name] ?? [];
}

export function fetcherFile(name: string): string {
  return fileURLToPath(new URL(`./fetchers/${name}`, import.meta.url));
}
