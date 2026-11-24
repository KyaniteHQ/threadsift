import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import { type VaultChange, VaultFileConflict } from "../src/core/kernel/vault-target.ts";
import { VaultFailure } from "../src/features/vault/core/vault-failure.ts";
import { vaultFolder } from "../src/targets/node/vault-folder.ts";
import { heldFolderLease } from "./vault-lease-fixtures.ts";

const NOTE = "Threadsift/items/1/note-1.md";

const FIRST_SHA = "fe4f02ad058b43f6ed467fdf65b935107529564b";

const note = (text: string | null, path = NOTE): VaultChange => {
  const base = { path, subjectId: 1, noteKind: "item", sequence: 1, sha: null } as const;

  return text === null
    ? { ...base, kind: "delete" }
    : { ...base, kind: "put", bytes: new TextEncoder().encode(text) };
};

describe("Folder mode writes a mounted vault folder and owns only the files it wrote", () => {
  let root = "";
  let vault = "";
  let outside = "";
  let lease: Awaited<ReturnType<typeof heldFolderLease>>;

  const target = (signal = new AbortController().signal) => vaultFolder(vault, signal);

  const write = (files: readonly VaultChange[]) =>
    target().write({ files, current: lease.current });

  const inVault = (path: string) => join(vault, path);

  before(async () => {
    lease = await heldFolderLease("/a-folder-the-lease-names");
  });

  after(() => {
    lease[Symbol.dispose]();
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "threadsift-vault-folder-"));
    vault = join(root, "vault");
    outside = join(root, "outside");
    mkdirSync(vault);
    mkdirSync(outside);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("publishes a note at its path and keeps a hard-link receipt of it under .written", async () => {
    await write([note("first")]);

    assert.equal(readFileSync(inVault(NOTE), "utf8"), "first");
    assert.equal(
      statSync(inVault(NOTE)).ino,
      statSync(inVault(`Threadsift/.written/items/1/note-1.md`)).ino,
    );
    assert.deepEqual(await target().subjects(), [{ kind: "item", subjectId: 1 }]);
    assert.deepEqual(await target().files({ kind: "item", subjectId: 1 }), [
      { path: NOTE, sha: FIRST_SHA },
    ]);
  });

  it("replaces a note it wrote and keeps one receipt for it", async () => {
    await write([note("first")]);
    await write([note("second")]);

    assert.equal(readFileSync(inVault(NOTE), "utf8"), "second");
    assert.equal(
      statSync(inVault(NOTE)).ino,
      statSync(inVault(`Threadsift/.written/items/1/note-1.md`)).ino,
    );
    assert.deepEqual(readdirSync(inVault("Threadsift/.written/.staging")), []);
  });

  it("lists only the files it wrote", async () => {
    await write([note("mine")]);
    writeFileSync(inVault("Threadsift/items/1/owner.md"), "owner");

    assert.deepEqual(
      (await target().files({ kind: "item", subjectId: 1 })).map(({ path }) => path),
      [NOTE],
    );
  });

  it("never deletes a file the owner put at the path", async () => {
    mkdirSync(inVault("Threadsift/items/1"), { recursive: true });
    writeFileSync(inVault(NOTE), "the owner's file");

    await write([note(null)]);

    assert.equal(readFileSync(inVault(NOTE), "utf8"), "the owner's file");
  });

  it("does not write through a symbolic link at the path", async () => {
    mkdirSync(inVault("Threadsift/items/1"), { recursive: true });
    symlinkSync(join(outside, "target.md"), inVault(NOTE));

    await assert.rejects(write([note("mine")]), VaultFileConflict);
    assert.deepEqual(readdirSync(outside), []);
  });

  it("does not follow a symbolic link that stands for the Threadsift folder", async () => {
    symlinkSync(outside, inVault("Threadsift"));

    await assert.rejects(write([note("mine")]), { reason: "folder-path" });
    await assert.rejects(target().verify(), { reason: "folder-path" });
    assert.deepEqual(readdirSync(outside), []);
  });

  it("refuses a path outside Threadsift and a path that climbs out of it", async () => {
    await assert.rejects(write([note("mine", "Other/note.md")]), { reason: "folder-path" });
    await assert.rejects(write([note("mine", "Threadsift/items/../../escape.md")]), {
      reason: "folder-path",
    });
    assert.equal(existsSync(inVault("Other")), false);
    assert.equal(existsSync(inVault("escape.md")), false);
    assert.equal(existsSync(join(root, "escape.md")), false);
  });

  it("writes nothing once a restore has fenced its lease on the stored settings", async () => {
    using fenced = await heldFolderLease(vault);

    await target().write({ files: [note("first")], current: fenced.current });
    await fenced.fence();

    await assert.rejects(target().write({ files: [note("second")], current: fenced.current }), {
      reason: "stale",
    });
    assert.equal(readFileSync(inVault(NOTE), "utf8"), "first");
  });

  it("stops when its signal is aborted", async () => {
    const stop = new AbortController();

    stop.abort();

    await assert.rejects(
      target(stop.signal).write({ files: [note("mine")], current: lease.current }),
      {
        name: "AbortError",
      },
    );
    assert.deepEqual(readdirSync(vault), []);
  });

  it("names a path that is a file, not a folder", async () => {
    writeFileSync(inVault("a-file"), "");

    await assert.rejects(
      vaultFolder(inVault("a-file"), new AbortController().signal).verify(),
      (error) => {
        assert.ok(error instanceof VaultFailure);
        assert.equal(error.reason, "folder-path");

        return true;
      },
    );
  });
});
