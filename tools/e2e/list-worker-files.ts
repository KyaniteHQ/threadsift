import { z } from "zod";

const PAGE = 100;

const Listing = z.object({
  result: z.array(z.object({ key: z.string(), size: z.number(), last_modified: z.string() })),
  result_info: z.object({ is_truncated: z.string(), cursor: z.string().optional() }),
});

interface ListedFile {
  readonly key: string;
  readonly size: number;
  readonly uploadedAt: number;
}

const [api = "", bucket = "", prefix = ""] = process.argv.slice(2);

if (api === "" || bucket === "") {
  throw new Error("usage: list-worker-files.ts <Local Explorer API url> <bucket> [prefix]");
}

async function listFrom(cursor: string | null): Promise<ListedFile[]> {
  const query = new URLSearchParams({ prefix, per_page: String(PAGE) });

  if (cursor !== null) query.set("cursor", cursor);

  const response = await fetch(`${api}/r2/buckets/${bucket}/objects?${query}`);

  if (!response.ok) {
    throw new Error(`listing ${bucket} answered ${response.status}: ${await response.text()}`);
  }

  const { result, result_info: info } = Listing.parse(await response.json());

  const files = result.map(({ key, size, last_modified: modified }) => ({
    key,
    size,
    uploadedAt: Date.parse(modified),
  }));

  return info.is_truncated === "true" && info.cursor !== undefined
    ? [...files, ...(await listFrom(info.cursor))]
    : files;
}

console.log(JSON.stringify(await listFrom(null)));
