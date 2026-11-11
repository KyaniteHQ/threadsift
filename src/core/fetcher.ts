import { z } from "zod";

import { SuppliedPageSchema } from "./supplied-page.ts";

export const PluginPageSchema = SuppliedPageSchema.omit({ videos: true }).strict();

export type PluginPage = Readonly<z.infer<typeof PluginPageSchema>>;

export interface FetchContext {
  readonly signal: AbortSignal;
}

export interface Fetcher {
  readonly matches: (url: string) => boolean;
  readonly fetch: (url: string, context: Readonly<FetchContext>) => Promise<PluginPage>;
}

export interface LoadedFetcher {
  readonly module: string;
  readonly fetcher: Fetcher;
}

const FetcherMethodsSchema = z.object({
  matches: z.instanceof(Function),
  fetch: z.instanceof(Function),
});

export function isFetcher(value: unknown): value is Fetcher {
  return FetcherMethodsSchema.safeParse(value).success;
}
