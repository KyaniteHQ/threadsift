import { join } from "node:path";

import { getPlatformProxy } from "wrangler";

const PAGE = 100;

interface ListedObject {
  readonly key: string;
  readonly size: number;
  readonly uploaded: Date;
}

interface ListedPage {
  readonly objects: readonly ListedObject[];
  readonly truncated: boolean;
  readonly cursor?: string;
}

interface ListOptions {
  readonly prefix: string;
  readonly limit: number;
  cursor?: string;
}

interface Bucket {
  readonly list: (options: Readonly<ListOptions>) => Promise<ListedPage>;
}

interface ListedFile {
  readonly key: string;
  readonly size: number;
  readonly uploadedAt: number;
}

const [state = "", prefix = ""] = process.argv.slice(2);

if (state === "") {
  throw new Error("usage: list-worker-files.ts <wrangler state folder> [prefix]");
}

async function listFrom(bucket: Bucket, cursor: string | null): Promise<ListedFile[]> {
  const options: ListOptions = { prefix, limit: PAGE };

  if (cursor !== null) options.cursor = cursor;

  const page = await bucket.list(options);

  const files = page.objects.map(({ key, size, uploaded }) => ({
    key,
    size,
    uploadedAt: uploaded.getTime(),
  }));

  return page.truncated && page.cursor !== undefined
    ? [...files, ...(await listFrom(bucket, page.cursor))]
    : files;
}

const proxy = await getPlatformProxy<{ FILES: Bucket }>({
  configPath: join(import.meta.dirname, "../../wrangler.jsonc"),
  persist: { path: join(state, "v3") },
  remoteBindings: false,
});

try {
  console.log(JSON.stringify(await listFrom(proxy.env.FILES, null)));
} finally {
  await proxy.dispose();
}
