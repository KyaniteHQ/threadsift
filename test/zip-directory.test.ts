import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RESTORE_DIRECTORY_BYTES } from "../src/core/contract/restore-contract.ts";
import { readDirectory } from "../src/features/export/core/zip-directory.ts";
import { type ZipSource, entryBytes } from "../src/features/export/core/zip-read.ts";
import { endOfArchive, packFiles } from "../src/features/export/core/zip.ts";
import { listedByPython } from "./python-zip.ts";
import { ZIP_DOS, TEXT, directoryOf, entriesOf, sourceOf, zipOfFiles } from "./zip-fixtures.ts";

const FAR_OFFSET = 2 ** 32 + 100;

const ZIP64_END_RECORD = [0x50, 0x4b, 0x06, 0x06];

const PLAIN_END_RECORD = [0x50, 0x4b, 0x05, 0x06];

const END_RECORDS_BYTES = 22 + 56 + 20;

const fileOf = (name: string, text = "") => ({ name, bytes: TEXT.encode(text) });

const bytesAt = (zip: Uint8Array, from: number) => [...zip.subarray(from, from + 4)];

describe("the zip the Export writes is a store-mode zip, with ZIP64 records once a count passes 16 bits or an offset passes 32 bits", () => {
  it("writes ZIP64 end records for 65,536 entries that an independent zip reader and the Restore reader both list", async () => {
    const files = Array.from({ length: 65_536 }, (_, at) => fileOf(`root/${String(at)}`));
    const zip = zipOfFiles(files);
    const directory = await directoryOf(zip);

    assert.deepEqual(bytesAt(zip, zip.length - END_RECORDS_BYTES), ZIP64_END_RECORD);
    assert.equal(directory.entries.length, 65_536);
    assert.equal(directory.entries.at(-1)?.name, "root/65535");
    assert.equal(listedByPython(zip), "65536 root/65535");
  });

  it("writes a plain end record for 65,534 entries and ZIP64 records from 65,535, the count a 16-bit field keeps for ZIP64", () => {
    const files = Array.from({ length: 65_535 }, (_, at) => fileOf(`root/${String(at)}`));
    const plain = zipOfFiles(files.slice(0, 65_534));
    const wide = zipOfFiles(files);

    assert.deepEqual(bytesAt(plain, plain.length - 22), PLAIN_END_RECORD);
    assert.notDeepEqual(bytesAt(plain, plain.length - END_RECORDS_BYTES), ZIP64_END_RECORD);
    assert.equal(listedByPython(plain), "65534 root/65533");
    assert.deepEqual(bytesAt(wide, wide.length - END_RECORDS_BYTES), ZIP64_END_RECORD);
    assert.equal(listedByPython(wide), "65535 root/65534");
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

    assert.equal(end.length, END_RECORDS_BYTES);

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

describe("the zip reader lists a multibyte entry name and refuses input it cannot read", () => {
  it("returns each entry's name and bytes for a name outside ASCII", async () => {
    const zip = zipOfFiles([
      fileOf("root/\u00FC.txt", "ein Zeichen"),
      fileOf("root/a.txt", "plain"),
    ]);
    const entries = await entriesOf(zip);

    assert.deepEqual([...entries.keys()], ["root/\u00FC.txt", "root/a.txt"]);
    assert.equal(new TextDecoder().decode(entries.get("root/\u00FC.txt")), "ein Zeichen");
  });

  it("answers malformed for zero bytes", async () => {
    await assert.rejects(directoryOf(new Uint8Array(0)), { fault: "malformed" });
  });
});

describe("the zip reader refuses a directory larger than the limit it is given", () => {
  it("answers malformed for a directory of one entry read under a limit of 10 bytes", async () => {
    await assert.rejects(readDirectory(sourceOf(zipOfFiles([fileOf("root/a.txt")])), 10), {
      fault: "malformed",
    });
  });
});
