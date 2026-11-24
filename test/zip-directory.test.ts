import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RESTORE_DIRECTORY_BYTES } from "../src/core/contract/restore-contract.ts";
import { readDirectory } from "../src/features/export/core/zip-directory.ts";
import { type ZipSource, entryBytes } from "../src/features/export/core/zip-read.ts";
import { endOfArchive, packFiles } from "../src/features/export/core/zip.ts";
import { ZIP_DOS, directoryOf, entriesOf, sourceOf, zipOf, zipOfFiles } from "./zip-fixtures.ts";

const ZIP16_LIMIT = 0xff_ff;

const FAR_OFFSET = 2 ** 32 + 100;

const END_RECORD = [0x50, 0x4b, 0x05, 0x06];

const ZIP64_END_RECORD = [0x50, 0x4b, 0x06, 0x06];

const END_BYTES = 22;

const ZIP64_TAIL_BYTES = 56 + 20;

const TEXT = new TextEncoder();

const fileOf = (name: string, text = "") => ({ name, bytes: TEXT.encode(text) });

const zipNamed = (names: readonly string[]) => zipOfFiles(names.map((name) => fileOf(name, name)));

const bytesAt = (zip: Uint8Array, from: number) => [...zip.subarray(from, from + 4)];

function zipWithRawName(): Uint8Array {
  const zip = zipOfFiles([fileOf("root/aa")]);
  const name = TEXT.encode("root/aa");

  for (let at = 0; at + name.length <= zip.length; at += 1) {
    if (name.every((byte, position) => zip[at + position] === byte)) {
      zip[at + name.length - 2] = 0xff;
      zip[at + name.length - 1] = 0xfe;
    }
  }

  return zip;
}

describe("the zip the Export writes is a store-mode zip, with ZIP64 records once a count passes 16 bits or an offset passes 32 bits", () => {
  it("writes a plain end record for a small archive and reads each entry back by its name, size and checksum", async () => {
    const zip = zipOf(
      new Map([
        ["root/a.txt", TEXT.encode("alpha")],
        ["root/b/c.txt", TEXT.encode("")],
        ["root/ü.txt", TEXT.encode("unicode name")],
      ]),
    );

    const directory = await directoryOf(zip);
    const entries = await entriesOf(zip);

    assert.equal(directory.root, "root");
    assert.deepEqual(
      directory.entries.map(({ name, size }) => [name, size]),
      [
        ["root/a.txt", 5],
        ["root/b/c.txt", 0],
        ["root/ü.txt", 12],
      ],
    );
    assert.equal(new TextDecoder().decode(entries.get("root/ü.txt")), "unicode name");
    assert.deepEqual(bytesAt(zip, zip.length - END_BYTES), END_RECORD);
  });

  it("writes ZIP64 end records for 65,536 entries and reads every entry", async () => {
    const files = Array.from({ length: ZIP16_LIMIT + 1 }, (_, at) => fileOf(`root/${String(at)}`));
    const zip = zipOfFiles(files);
    const directory = await directoryOf(zip);

    assert.deepEqual(bytesAt(zip, zip.length - END_BYTES - ZIP64_TAIL_BYTES), ZIP64_END_RECORD);
    assert.equal(directory.entries.length, ZIP16_LIMIT + 1);
    assert.equal(directory.entries.at(-1)?.name, `root/${String(ZIP16_LIMIT)}`);
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

    assert.equal(end.length, 22 + 56 + 20);

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

    assert.equal(entry?.headerOffset, FAR_OFFSET);
    assert.ok(entry !== undefined);
    assert.equal(new TextDecoder().decode(await entryBytes(source, directory, entry)), "far away");
  });
});

describe("the zip reader refuses a directory that Restore must not trust", () => {
  const refused: readonly [string, () => Uint8Array][] = [
    ["a parent folder", () => zipNamed(["root/a.txt", "root/../b.txt"])],
    ["an absolute name", () => zipNamed(["/root/a.txt"])],
    ["an empty segment", () => zipNamed(["root//a.txt"])],
    ["a backslash", () => zipNamed(["root/a\\b.txt"])],
    ["a NUL character", () => zipNamed(["root/a\0b.txt"])],
    ["a dot segment", () => zipNamed(["root/./a.txt"])],
    ["two root folders", () => zipNamed(["root/a.txt", "other/b.txt"])],
    ["an entry outside any folder", () => zipNamed(["a.txt"])],
    ["a name used twice", () => zipNamed(["root/a.txt", "root/a.txt"])],
    ["a name that is not UTF-8", zipWithRawName],
  ];

  for (const [name, build] of refused) {
    it(`refuses ${name} as a bad-name`, async () => {
      await assert.rejects(directoryOf(build()), {
        fault: "bad-name",
      });
    });
  }

  it("refuses bytes that are not a zip, and a zip with its end cut off, as malformed", async () => {
    const zip = zipNamed(["root/a.txt"]);

    await Promise.all(
      [TEXT.encode("this is not a zip"), new Uint8Array(0), zip.subarray(0, zip.length - 5)].map(
        (bytes) =>
          assert.rejects(directoryOf(bytes), {
            fault: "malformed",
          }),
      ),
    );
  });

  it("refuses a directory larger than the limit it is given", async () => {
    await assert.rejects(readDirectory(sourceOf(zipNamed(["root/a.txt"])), 10), {
      fault: "malformed",
    });
  });
});
