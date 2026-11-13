import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { z } from "zod";

import { errorClassOf } from "../../core/failure-log.ts";
import { type Fetcher, type LoadedFetcher, isFetcher } from "../../core/fetcher.ts";

type Stage = "specifier" | "file" | "import" | "shape";

interface Entry {
  readonly module: string;
  readonly path: string;
}

const FILE_URL = /^file:/iu;

const ModuleSchema = z.object({ default: z.custom<Fetcher>(isFetcher) });

class FetcherLoadError extends Error {
  constructor(module: string, stage: Stage, errorClass: string) {
    super(`fetcher module ${JSON.stringify(module)} failed at ${stage} (${errorClass})`);
  }
}

async function atStage<Value>(
  module: string,
  stage: Stage,
  step: () => Promise<Value> | Value,
): Promise<Value> {
  try {
    return await step();
  } catch (error) {
    throw new FetcherLoadError(module, stage, errorClassOf(error));
  }
}

function pathOf(module: string): string {
  if (!FILE_URL.test(module)) {
    if (!isAbsolute(module)) throw new TypeError();

    return module;
  }

  if (module.includes("?") || module.includes("#")) throw new TypeError();

  return fileURLToPath(module);
}

async function realFileOf(path: string): Promise<string> {
  const real = await realpath(path);

  if (!(await stat(real)).isFile()) throw new TypeError();

  return real;
}

async function importedFetcher({ module, path }: Readonly<Entry>): Promise<LoadedFetcher> {
  const namespace: unknown = await atStage(
    module,
    "import",
    () => import(pathToFileURL(path).href),
  );

  const exported = await atStage(module, "shape", () => ModuleSchema.parse(namespace));

  return { module, fetcher: exported.default };
}

async function importedInOrder(entries: readonly Entry[]): Promise<readonly LoadedFetcher[]> {
  const [first, ...rest] = entries;

  if (first === undefined) return [];

  return [await importedFetcher(first), ...(await importedInOrder(rest))];
}

function withoutRepeats(entries: readonly Entry[]): readonly Entry[] {
  const seen = new Set<string>();

  for (const { module, path } of entries) {
    if (seen.has(path)) throw new FetcherLoadError(module, "file", "TypeError");

    seen.add(path);
  }

  return entries;
}

async function resolved(modules: readonly string[]): Promise<readonly Entry[]> {
  const entries = await Promise.all(
    modules.map(async (module) => {
      const specified = await atStage(module, "specifier", () => pathOf(module));

      return { module, path: await atStage(module, "file", () => realFileOf(specified)) };
    }),
  );

  return withoutRepeats(entries);
}

export async function loadFetchers(list: string | undefined): Promise<readonly LoadedFetcher[]> {
  if (list === undefined || list.trim() === "") return [];

  const entries = await resolved(list.split(",").map((module) => module.trim()));

  const loaded = await importedInOrder(entries);

  for (const { module } of loaded) console.log(JSON.stringify({ event: "fetcher-loaded", module }));

  return loaded;
}
