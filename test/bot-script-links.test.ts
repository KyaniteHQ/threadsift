import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { TopicIndexSchema } from "../src/core/topic-index-contract.ts";
import { ScriptWorld } from "./bot-script-world.ts";
import { intakeThread } from "./bot-skills-examples.ts";
import { SKILL_PATH, botFile, fencesOf } from "./bot-skills-reader.ts";

const STATUS_ID = "1999999999999999001";

const CursorSchema = z.object({ cursor: z.string() });

const IdsSchema = z.object({ ids: z.array(z.string()) });

const SentLinksSchema = z.object({
  items: z.array(z.object({ originalUrl: z.string() })),
});

const SearchFileSchema = z.object({
  items: z.array(z.object({ normalizedUrl: z.string() })),
});

describe("the script checks the connection, saves, searches and lists topics, and prints one word for each answer of a real Instance", () => {
  let world: ScriptWorld;

  const run = async (
    args: readonly string[],
    env: Readonly<Record<string, string>> = world.env(),
  ) => (await world.folder.run(args, env)).word;

  const xPost = () => link("x", `https://x.com/someone/status/${STATUS_ID}`);

  const link = (name: string, text: string) => world.folder.tmpFile(name, text, "txt");

  const ids = (list: readonly string[]) =>
    world.folder.made("bookmarks", JSON.stringify({ ids: list }));

  const read = async <Schema extends z.ZodType>(
    path: string,
    schema: Schema,
  ): Promise<z.infer<Schema>> =>
    schema.parse(
      await (
        await fetch(`${world.address}${path}`, {
          headers: { Authorization: `Bearer ${world.agentToken}` },
        })
      ).json(),
    );

  const cursorOf = async (name: string) =>
    (await read(`/api/imports/${name}`, CursorSchema)).cursor;

  const stored = async () =>
    (await read("/api/items", SentLinksSchema)).items.map(({ originalUrl }) => originalUrl);

  before(async () => {
    world = await ScriptWorld.start();
  });

  after(() => world.close());

  it("answers check with ok for a token that reads, and unauthorized, forbidden, unreachable or failed for the other outcomes", async () => {
    const addOnly = await world.tokenWith("add-only", ["add"]);

    assert.equal(await run(["check"]), "ok");
    assert.equal(await run(["check"], world.env(world.address, "wrong")), "unauthorized");
    assert.equal(await run(["check"], world.env(world.address, addOnly)), "forbidden");
    assert.equal(await run(["check"], world.env("http://127.0.0.1:1")), "unreachable");
    assert.equal(await run(["check"], world.env(world.failingAddress)), "failed");
  });

  it("answers not-configured before any request when the address or the token is missing or the address is more than an origin", async () => {
    const options = { PATH: process.env["PATH"] ?? "" };
    const without = (name: string) => ({ ...world.env(), [name]: "" });

    assert.equal(await run(["check"], without("THREADSIFT_URL")), "not-configured");
    assert.equal(await run(["check"], without("THREADSIFT_AGENT_TOKEN")), "not-configured");
    assert.equal((await world.folder.run(["check"], options)).word, "not-configured");

    const addresses = [
      `${world.address}/x`,
      "https://good.example?x=",
      "https://good.example#a",
      "https://user@evil.example",
      "https://good.example\\@evil",
      "http://good.example:80",
    ];

    assert.deepEqual(
      await Promise.all(addresses.map((address) => run(["check"], world.env(address)))),
      addresses.map(() => "not-configured"),
    );
  });

  it("ignores the curl settings of the home folder", async () => {
    const home = mkdtempSync(join(tmpdir(), "threadsift-home-"));

    writeFileSync(join(home, ".curlrc"), 'proxy = "http://127.0.0.1:1"\n');

    try {
      assert.equal(await run(["check"], { ...world.env(), HOME: home }), "ok");
    } finally {
      rmSync(home, { recursive: true });
    }
  });

  it("saves a new link as ok, answers duplicate for the same link, invalid with the reasons for a link the Instance refuses and bad-input for text that is not a link, and deletes every file it was given", async () => {
    const saved = "https://example.com/threadsift-script";
    const first = await world.folder.made("link", saved, "txt");

    const refused = await world.folder.run(
      ["save", link("refused", "http://127.0.0.1/")],
      world.env(),
    );

    assert.equal(await run(["save", first]), "ok");
    assert.equal(existsSync(first), false);
    assert.equal(await run(["save", link("saved", saved)]), "duplicate");
    assert.equal(refused.word, "invalid");
    assert.notEqual(refused.reasons, "");
    assert.equal(await run(["save", link("text", "not a link")]), "bad-input");
    assert.deepEqual(
      world.folder.tree().filter((entry) => entry.startsWith("tmp/")),
      [],
    );
  });

  it("saves an X link with its thread from a file, and refuses a thread that is not the link's post", async () => {
    const thread = () => world.folder.tmpFile("thread", intakeThread(STATUS_ID));

    assert.equal(await run(["save", xPost(), thread()]), "ok");
    assert.equal(await run(["save", xPost(), thread()]), "duplicate");
    assert.equal(
      await run(["save", xPost(), world.folder.tmpFile("wrong", "not a thread")]),
      "invalid",
    );
  });

  it("writes the matches of a search to tmp/search-<hex of the query file>.json and prints ok, and none for a search that finds nothing", async () => {
    await world.instance.tick();

    const query = await world.folder.made("query", "backup", "txt");
    const hex = basename(query).slice("query-".length, -".txt".length);
    const found = await run(["search", query]);

    const file = SearchFileSchema.parse(
      JSON.parse(readFileSync(join(world.folder.path, "tmp", `search-${hex}.json`), "utf8")),
    );

    assert.equal(found, "ok");
    assert.equal(existsSync(query), false);
    assert.equal(await run(["search", link("nothing", "zzzqqqxxx")]), "none");
    assert.ok(file.items.length > 0);
    assert.equal(await run(["search", link("long", "a".repeat(201))]), "invalid");
  });

  it("writes the Topics of the library to tmp/topics-<hex>.json for the hex of a fresh mark and prints ok, and bad-input for any other name", async () => {
    await world.instance.tick();

    const { word: delimiter } = await world.folder.run(["mark"], {});
    const hex = delimiter.slice("TS_".length);

    assert.equal(await run(["topics", hex]), "ok");

    const index = TopicIndexSchema.parse(
      JSON.parse(readFileSync(join(world.folder.path, "tmp", `topics-${hex}.json`), "utf8")),
    );

    assert.ok(index.topics.length > 0);
    assert.equal(await run(["topics"]), "bad-input");
    assert.equal(await run(["topics", "../x"]), "bad-input");
    assert.equal(await run(["topics", "ABC"]), "bad-input");
  });

  it("sends bookmark post ids as links that the Instance stores as the links https://x.com/i/status/<id>, answers known for the same ids, and keeps and reads back the cursor of the sync and of the import from the first id of the file sent", async () => {
    const three = ["2000000000000000001", "2000000000000000002", "2000000000000000003"];

    assert.equal(await run(["bookmarks-cursor"]), "none");
    assert.equal(await run(["bookmarks-send", await ids(three)]), "ok 3 0 0");

    const urls = await stored();

    assert.ok(three.every((id) => urls.includes(`https://x.com/i/status/${id}`)));
    assert.equal(await run(["bookmarks-send", await ids(three)]), "ok 0 3 0");
    assert.equal(await run(["bookmarks-cursor"]), "none");

    const sent = await ids(three.slice(2));

    assert.equal(await run(["bookmarks-send", sent, "cursor"]), "ok 0 1 0");
    assert.equal(existsSync(sent), false);
    assert.equal(await run(["bookmarks-cursor"]), "2000000000000000003");
    assert.equal(
      await run(["bookmarks-send", await ids(three.slice(0, 2).toReversed()), "cursor", "all"]),
      "ok 0 2 0",
    );
    assert.equal(await run(["bookmarks-cursor"]), "2000000000000000003");
    assert.equal(await cursorOf("x-bookmarks-all"), "2000000000000000002");
  });

  it("sends the ids of the example in the skill, and answers bad-input and changes neither the library nor the cursor for a file that is not 1 to 100 post ids or for words that are not cursor or cursor all", async () => {
    const shown = fencesOf(botFile(SKILL_PATH).text).find(({ label }) => label === "ids");
    const example = IdsSchema.parse(JSON.parse(shown?.body ?? ""));
    const file = (text: string) => world.folder.made("bookmarks", text);
    const valid = '{"ids":["2000000000000000011"]}';

    assert.equal(
      await run(["bookmarks-send", await file(shown?.body ?? "")]),
      `ok ${String(example.ids.length)} 0 0`,
    );

    const unchanged = [await stored(), await run(["bookmarks-cursor"])];

    const refused = [
      "not json",
      '{"ids":[]}',
      '{"ids":["12a"]}',
      '{"ids":[12]}',
      '{"ids":["1"],"extra":1}',
      JSON.stringify({ ids: Array.from({ length: 101 }, (_, index) => String(index + 1)) }),
    ];

    assert.deepEqual(
      await Promise.all(refused.map(async (text) => run(["bookmarks-send", await file(text)]))),
      refused.map(() => "bad-input"),
    );

    const words = [["abc"], ["all"], ["", "all"], ["cursor", "abc"], ["2000000000000000011"]];

    assert.deepEqual(
      await Promise.all(
        words.map(async (rest) => run(["bookmarks-send", await file(valid), ...rest])),
      ),
      words.map(() => "bad-input"),
    );
    assert.equal(
      await run(["bookmarks-send", join(world.folder.path, "threadsift.sh")]),
      "bad-input",
    );
    assert.deepEqual([await stored(), await run(["bookmarks-cursor"])], unchanged);
  });

  it("answers failed when the Instance answers a batch with fewer results than the ids sent", async () => {
    const faulty = await world.answeringEmptyBatch();

    try {
      assert.equal(
        await run(["bookmarks-send", await ids(["2000000000000000021"])], world.env(faulty.url)),
        "failed",
      );
    } finally {
      faulty.stop();
    }
  });

  it("answers bad-input for a command the script does not offer, a search without a file and a task id that is not a number", async () => {
    assert.equal(await run(["bogus"]), "bad-input");
    assert.equal(await run(["task-get", "1"]), "bad-input");
    assert.equal(await run(["task-intake", "1", "x"]), "bad-input");
    assert.equal(await run(["search"]), "bad-input");
    assert.equal(await run(["task-answer", "abc", link("any", "{}")]), "bad-input");
  });
});
