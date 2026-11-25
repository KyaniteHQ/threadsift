import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempDisposableSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { after, before, describe, it } from "node:test";

import { VaultResultSchema, VaultViewSchema } from "../src/core/contract/vault-contract.ts";
import { Instance } from "./instance.ts";
import { paste, until } from "./library-fixtures.ts";
import { lines } from "./log-fixtures.ts";
import { nextSweep, nextSweepAt } from "./weekly-claim-fixtures.ts";

const SETTINGS = "/api/settings/obsidian";

const OWNER_NOTE = "A note the owner wrote at a path the mirror also uses.";

const SAVED_NOTE = "A Note that reaches the vault.";

const noteOf = (id: number) => `Threadsift/items/${String(id)}/note-${String(id)}.md`;

const swept = <Value>(
  what: string,
  instance: Instance,
  read: () => Value | Promise<Value>,
  isDone: (value: Value) => boolean,
) =>
  until(
    what,
    async () => {
      await nextSweep(instance);

      return read();
    },
    isDone,
  );

const none = (left: readonly unknown[]) => left.length === 0;

describe("the Folder Vault mirror writes the library under Threadsift in a mounted folder, and only files it wrote", () => {
  let instance: Instance;
  let vault: string;
  let scratch: ReturnType<typeof mkdtempDisposableSync>;
  let outside: ReturnType<typeof mkdtempDisposableSync>;
  let conflicted: number;
  let mirrored: number;

  const at = (path: string) => `${vault}/${path}`;
  const text = (path: string) => readFileSync(at(path), "utf8");
  const view = () => instance.read("GET", SETTINGS, VaultViewSchema);

  const conflicts = async () => {
    const seen = await view();

    assert.ok(seen.mode === "folder");

    return seen.conflicts;
  };

  const verify = (folder: string) =>
    instance.read("POST", `${SETTINGS}/verify`, VaultResultSchema, { mode: "folder", folder });

  before(async () => {
    scratch = mkdtempDisposableSync(`${tmpdir()}/threadsift-vault-`);
    vault = scratch.path;
    outside = mkdtempDisposableSync(`${tmpdir()}/threadsift-vault-outside-`);
    instance = await Instance.start();
    await instance.setUp();
    conflicted = await paste(instance, "conflicted", { title: "Conflicted", topic: "Reading" });
    mirrored = await paste(instance, "mirrored", { title: "Mirrored", topic: "Reading" });
  });

  after(async () => {
    await instance.close();
    scratch.remove();
    outside.remove();
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

  it("names a path that is a file and a Threadsift folder that is a symbolic link, and writes nothing", async () => {
    writeFileSync(at("a-file"), "");
    assert.deepEqual(await verify(at("a-file")), { kind: "refused", reason: "folder-path" });
    rmSync(at("a-file"));

    symlinkSync(outside.path, at("Threadsift"));

    try {
      assert.deepEqual(await verify(vault), { kind: "refused", reason: "folder-path" });
      assert.deepEqual(readdirSync(outside.path), []);
    } finally {
      rmSync(at("Threadsift"));
    }

    assert.deepEqual(readdirSync(vault), []);
  });

  const retryAt = () =>
    instance.database.count(
      "select retry_at as n from mirror_notes where conflict_path is not null",
    );

  const conflictLines = async () =>
    (await lines(instance)).filter((line) => line.startsWith("vault-file-conflict"));

  it("mirrors every Item note, the Topic page, the Index and the Log into the saved folder, parks the path of a note the owner holds until its file is gone, follows library changes, and keeps its files on disconnect", async () => {
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

    await swept(
      "the Item note and the Index are gone",
      instance,
      () => absent([noteOf(mirrored), "Threadsift/Index.md"]),
      none,
    );

    const note = text(noteOf(mirrored));
    const topicPage = /\[\[(Threadsift\/topics\/topic-\d+)\|Reading\]\]/u.exec(note)?.[1];

    assert.ok(topicPage !== undefined, "the note links its Topic page");

    const month = new Date().toISOString().slice(0, "2026-11".length);

    await swept(
      "the Topic page and the month Log are gone",
      instance,
      () => absent([`${topicPage}.md`, `Threadsift/log/${month}.md`]),
      none,
    );

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

    await swept(
      "the mirror reports a Folder mode conflict",
      instance,
      view,
      (seen) => seen.mode === "folder" && seen.conflicts.length > 0,
    );

    assert.deepEqual(await conflicts(), [noteOf(conflicted)]);
    assert.equal(text(noteOf(conflicted)), OWNER_NOTE);
    assert.ok(existsSync(at(noteOf(mirrored))));

    const parkedUntil = retryAt();

    await nextSweepAt(instance, parkedUntil - 1);

    assert.equal(retryAt(), parkedUntil);
    assert.deepEqual(await conflicts(), [noteOf(conflicted)]);
    assert.deepEqual(await conflictLines(), [`vault-file-conflict | ${noteOf(conflicted)}`]);

    const first = retryAt();

    await nextSweepAt(instance, first);

    assert.equal(retryAt(), first + 60_000);
    assert.deepEqual(await conflicts(), [noteOf(conflicted)]);
    assert.equal(text(noteOf(conflicted)), OWNER_NOTE);
    assert.deepEqual(await conflictLines(), [`vault-file-conflict | ${noteOf(conflicted)}`]);

    const path = at(noteOf(conflicted));
    const aside = at("owner-note.md");

    renameSync(path, aside);

    try {
      await nextSweepAt(instance, retryAt());

      assert.deepEqual(await conflicts(), []);
      assert.ok(text(noteOf(conflicted)).includes('aliases: ["Conflicted"]'));
      assert.deepEqual(await conflictLines(), [`vault-file-conflict | ${noteOf(conflicted)}`]);
    } finally {
      renameSync(aside, path);
    }

    const noteSaved = await instance.send("PUT", `/api/items/${String(mirrored)}/note`, {
      body: SAVED_NOTE,
      revision: 0,
    });

    assert.equal(noteSaved.status, 200);

    await swept(
      "the Item note holds the saved Note",
      instance,
      () => text(noteOf(mirrored)),
      (written) => written.includes(SAVED_NOTE),
    );

    assert.ok(text(noteOf(mirrored)).includes(SAVED_NOTE));

    assert.equal((await instance.send("DELETE", `/api/items/${String(mirrored)}`)).status, 204);

    await swept(
      "the note of the deleted Item is gone",
      instance,
      () => existsSync(at(noteOf(mirrored))),
      (exists) => !exists,
    );

    assert.equal(existsSync(at(noteOf(mirrored))), false);
    assert.equal(existsSync(at(`Threadsift/items/${String(mirrored)}`)), false);
    assert.equal(text(noteOf(conflicted)), OWNER_NOTE);
    assert.equal(text("Owner.md"), "Outside the mirror folder.");
    assert.equal(text("Threadsift/mine.md"), "Inside it, and not the mirror's.");

    const removed = await instance.read("DELETE", SETTINGS, VaultViewSchema);

    assert.equal(removed.mode, "github");
    assert.ok(existsSync(at("Threadsift/Index.md")));
    assert.ok(existsSync(at("Threadsift/log")));
  });
});
