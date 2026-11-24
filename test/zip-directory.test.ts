import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { RESTORE_DIRECTORY_BYTES } from "../src/core/contract/restore-contract.ts";
import { readDirectory } from "../src/features/export/core/zip-directory.ts";
import { type ZipSource, entryBytes } from "../src/features/export/core/zip-read.ts";
import {
  END_BYTES,
  ZIP64_END_BYTES,
  ZIP64_LOCATOR_BYTES,
  ZIP_COUNT_LIMIT,
  endOfArchive,
  packFiles,
} from "../src/features/export/core/zip.ts";
import { ZIP_DOS, directoryOf, sourceOf, zipOfFiles } from "./zip-fixtures.ts";

const FAR_OFFSET = 2 ** 32 + 100;

const ZIP64_END_RECORD = [0x50, 0x4b, 0x06, 0x06];

const ZIP64_TAIL_BYTES = ZIP64_END_BYTES + ZIP64_LOCATOR_BYTES;

const TEXT = new TextEncoder();

const fileOf = (name: string, text = "") => ({ name, bytes: TEXT.encode(text) });

const bytesAt = (zip: Uint8Array, from: number) => [...zip.subarray(from, from + 4)];

const PYTHON_LISTING = [
  "import sys, zipfile",
  "names = zipfile.ZipFile(sys.argv[1]).namelist()",
  "print(len(names), names[-1])",
].join("\n");

function listedByPython(zip: Uint8Array): string {
  const folder = mkdtempSync(join(tmpdir(), "threadsift-zip-"));

  try {
    const file = join(folder, "many.zip");

    writeFileSync(file, zip);

    const run = spawnSync("python3", ["-I", "-c", PYTHON_LISTING, file], {
      encoding: "utf8",
      env: { PATH: process.env["PATH"] ?? "" },
    });

    assert.equal(run.status, 0, run.stderr);

    return run.stdout.trim();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

describe("the zip the Export writes is a store-mode zip, with ZIP64 records once a count passes 16 bits or an offset passes 32 bits", () => {
  it("writes ZIP64 end records for 65,536 entries that an independent zip reader and the Restore reader both list", async () => {
    const files = Array.from({ length: ZIP_COUNT_LIMIT + 1 }, (_, at) =>
      fileOf(`root/${String(at)}`),
    );
    const zip = zipOfFiles(files);
    const directory = await directoryOf(zip);
    const last = `root/${String(ZIP_COUNT_LIMIT)}`;

    assert.deepEqual(bytesAt(zip, zip.length - END_BYTES - ZIP64_TAIL_BYTES), ZIP64_END_RECORD);
    assert.equal(directory.entries.length, ZIP_COUNT_LIMIT + 1);
    assert.equal(directory.entries.at(-1)?.name, last);
    assert.equal(listedByPython(zip), `${String(ZIP_COUNT_LIMIT + 1)} ${last}`);
  });

  it("writes a 64-bit offset for an entry that starts past 4 GiB and reads its bytes there, without a zip that large", async () => {
    const packed = packFiles([fileOf("root/far.txt", "far away")], {
      offset: FAR_OFFSET,
      dos: ZIP_DOS,
    });
    const directoryOffset = FAR_OFFSET + packed.data.length;
    const end = endOfArchive({
      entries: 1,
      directoryOffset,
      directorySize: packed.directory.length,
    });

    assert.equal(end.length, END_BYTES + ZIP64_TAIL_BYTES);

    const source: ZipSource = {
      size: directoryOffset + packed.directory.length + end.length,
      read: async function* read(offset, length) {
        const region = new Uint8Array(length);
        const place = (bytes: Uint8Array, at: number) => {
          const from = Math.max(offset, at);
          const to = Math.min(offset + length, at + bytes.length);

          if (to > from) region.set(bytes.subarray(from - at, to - at), from - offset);
        };

        place(packed.data, FAR_OFFSET);
        place(packed.directory, directoryOffset);
        place(end, directoryOffset + packed.directory.length);

        yield await Promise.resolve(region);
      },
    };

    const directory = await readDirectory(source, RESTORE_DIRECTORY_BYTES);
    const [entry] = directory.entries;

    assert.ok(entry !== undefined);
    assert.equal(entry.headerOffset, FAR_OFFSET);
    assert.equal(new TextDecoder().decode(await entryBytes(source, directory, entry)), "far away");
  });
});

describe("the zip reader refuses a directory larger than the limit it is given", () => {
  it("answers malformed for a directory of one entry read under a limit of 10 bytes", async () => {
    await assert.rejects(readDirectory(sourceOf(zipOfFiles([fileOf("root/a.txt")])), 10), {
      fault: "malformed",
    });
  });
});
