import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempDisposableSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { after, before, describe, it } from "node:test";

import { VaultResultSchema, VaultViewSchema } from "../src/core/contract/vault-contract.ts";
import { Instance } from "./instance.ts";
import { lines } from "./log-fixtures.ts";
import { paste, until, nextSweep } from "./related-fixtures.ts";

const SETTINGS = "/api/settings/obsidian";

const OWNER_NOTE = "A note the owner wrote at a path the mirror also uses.";

const SAVED_NOTE = "A Note that reaches the vault.";

const noteOf = (id: number) => `Threadsift/items/${String(id)}/note-${String(id)}.md`;

const swept = <Value>(
  instance: Instance,
  read: () => Value | Promise<Value>,
  isDone: (value: Value) => boolean,
) =>
  until(async () => {
    await nextSweep(instance);

    return read();
  }, isDone);

const none = (left: readonly unknown[]) => left.length === 0;

describe("the Folder Vault mirror writes the library under Threadsift in a mounted folder, and only files it wrote", () => {
  let instance: Instance;
  let vault: string;
  let scratch: ReturnType<typeof mkdtempDisposableSync>;
  let conflicted: number;
  let mirrored: number;

  const at = (path: string) => `${vault}/${path}`;
  const text = (path: string) => readFileSync(at(path), "utf8");
  const view = () => instance.read("GET", SETTINGS, VaultViewSchema);

  const verify = (folder: string) =>
    instance.read("POST", `${SETTINGS}/verify`, VaultResultSchema, { mode: "folder", folder });

  before(async () => {
    scratch = mkdtempDisposableSync(`${tmpdir()}/threadsift-vault-`);
    vault = scratch.path;
    instance = await Instance.start();
    await instance.setUp();
    conflicted = await paste(instance, "conflicted", { title: "Conflicted", topic: "Reading" });
    mirrored = await paste(instance, "mirrored", { title: "Mirrored", topic: "Reading" });
  });

  after(async () => {
    await instance.close();
    scratch.remove();
  });

  it("offers Folder on this Instance and starts on GitHub with nothing saved", async () => {
    assert.deepEqual(await view(), {
      mode: "github",
      folderAvailable: true,
      repository: "",
      branch: "main",
      secretReady: false,
      token: "none",
    });
  });

  it("verifies a writable folder, names a missing one, writes nothing and saves nothing", async () => {
    assert.deepEqual(await verify(vault), { kind: "verified" });
    assert.deepEqual(await verify(at("missing")), { kind: "refused", reason: "folder-missing" });
    assert.deepEqual(readdirSync(vault), []);
    assert.equal((await view()).mode, "github");
  });

  it("names a folder the server cannot write", { skip: process.getuid?.() === 0 }, async () => {
    const locked = at("locked");

    mkdirSync(locked);
    chmodSync(locked, 0o500);

    try {
      assert.deepEqual(await verify(locked), { kind: "refused", reason: "folder-permission" });
    } finally {
      chmodSync(locked, 0o700);
      rmSync(locked, { recursive: true });
    }
  });

  it("saves the folder, reads it back, and mirrors every Item note, the Topic page, the Index and the Log under Threadsift", async () => {
    mkdirSync(at(`Threadsift/items/${String(conflicted)}`), { recursive: true });
    writeFileSync(at(noteOf(conflicted)), OWNER_NOTE);
    writeFileSync(at("Owner.md"), "Outside the mirror folder.");
    writeFileSync(at("Threadsift/mine.md"), "Inside it, and not the mirror's.");

    const saved = await instance.read("PUT", SETTINGS, VaultResultSchema, {
      mode: "folder",
      folder: `${vault}/`,
    });

    assert.deepEqual(saved, {
      mode: "folder",
      folderAvailable: true,
      folder: vault,
      conflicts: [],
      secretReady: false,
    });

    const absent = (paths: readonly string[]) => paths.filter((path) => !existsSync(at(path)));

    await swept(instance, () => absent([noteOf(mirrored), "Threadsift/Index.md"]), none);

    const note = text(noteOf(mirrored));
    const topicPage = /\[\[(Threadsift\/topics\/topic-\d+)\|Reading\]\]/u.exec(note)?.[1];

    assert.ok(topicPage !== undefined, "the note links its Topic page");

    const month = new Date().toISOString().slice(0, "2026-11".length);

    await swept(instance, () => absent([`${topicPage}.md`, `Threadsift/log/${month}.md`]), none);

    for (const line of [
      `id: ${String(mirrored)}`,
      'aliases: ["Mirrored"]',
      'url: "https://example.com/related/mirrored"',
      "## Summary",
      "A short summary.",
    ]) {
      assert.ok(note.includes(line), line);
    }

    assert.ok(existsSync(at(`${topicPage}.md`)));
    assert.ok(text("Threadsift/Index.md").includes(`[[${topicPage}|Reading]]`));
  });

  it("names the path of a note the owner already holds, records the conflict once, and keeps writing the other Items", async () => {
    await swept(instance, view, (seen) => seen.mode === "folder" && seen.conflicts.length > 0);
    await nextSweep(instance);
    await nextSweep(instance);

    const current = await view();

    assert.ok(current.mode === "folder");
    assert.deepEqual(current.conflicts, [noteOf(conflicted)]);
    assert.equal(text(noteOf(conflicted)), OWNER_NOTE);
    assert.deepEqual(
      (await lines(instance)).filter((line) => line.startsWith("vault-file-conflict")),
      [`vault-file-conflict | ${noteOf(conflicted)}`],
    );
    assert.ok(existsSync(at(noteOf(mirrored))));
  });

  it("rewrites the notes a library change touches", async () => {
    const saved = await instance.send("PUT", `/api/items/${String(mirrored)}/note`, {
      body: SAVED_NOTE,
      revision: 0,
    });

    assert.equal(saved.status, 200);

    await swept(
      instance,
      () => text(noteOf(mirrored)),
      (note) => note.includes(SAVED_NOTE),
    );

    assert.ok(text(noteOf(mirrored)).includes(SAVED_NOTE));
  });

  it("removes the files of a deleted Item and leaves every file it did not write", async () => {
    assert.equal((await instance.send("DELETE", `/api/items/${String(mirrored)}`)).status, 204);

    await swept(
      instance,
      () => existsSync(at(noteOf(mirrored))),
      (exists) => !exists,
    );

    assert.equal(existsSync(at(noteOf(mirrored))), false);
    assert.equal(existsSync(at(`Threadsift/items/${String(mirrored)}`)), false);
    assert.equal(text(noteOf(conflicted)), OWNER_NOTE);
    assert.equal(text("Owner.md"), "Outside the mirror folder.");
    assert.equal(text("Threadsift/mine.md"), "Inside it, and not the mirror's.");
  });

  it("disconnects without deleting the files it wrote", async () => {
    const removed = await instance.read("DELETE", SETTINGS, VaultViewSchema);

    assert.equal(removed.mode, "github");
    assert.ok(existsSync(at("Threadsift/Index.md")));
    assert.ok(existsSync(at("Threadsift/log")));
  });
});
