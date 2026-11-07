import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "/data/files";
const prefix = process.argv[2] ?? "";
const listed = [];

if (existsSync(ROOT)) {
  for (const entry of readdirSync(ROOT, { recursive: true, withFileTypes: true })) {
    const key = relative(ROOT, join(entry.parentPath, entry.name));

    if (entry.isFile() && key.startsWith(prefix)) {
      const stats = lstatSync(join(ROOT, key));

      listed.push({ key, size: stats.size, uploadedAt: Math.floor(stats.mtimeMs) });
    }
  }
}

console.log(JSON.stringify(listed.toSorted((left, right) => (left.key < right.key ? -1 : 1))));
