import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { TopicIndexSchema } from "../src/core/topic-index-contract.ts";
import { ScriptWorld } from "./bot-script-world.ts";
import { intakeThread } from "./bot-skills-examples.ts";

const STATUS_ID = "1999999999999999001";

const SearchFileSchema = z.object({ items: z.array(z.object({ normalizedUrl: z.string() })) });

describe("the script checks the connection, saves, searches and lists topics, and prints one word for each answer of a real Instance", () => {
  let world: ScriptWorld;

  const run = async (
    args: readonly string[],
    env: Readonly<Record<string, string>> = world.env(),
  ) => (await world.folder.run(args, env)).word;

  const link = (name: string, text: string) => world.folder.tmpFile(`${name}.txt`, text);

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
    const settings = world.folder.tmpFile(".curlrc", 'proxy = "http://127.0.0.1:1"\n');

    assert.equal(await run(["check"], { ...world.env(), HOME: dirname(settings) }), "ok");
  });

  it("saves a new link as ok, answers duplicate for the same link, invalid with the reasons for a link the Instance refuses and bad-input for text that is not a link", async () => {
    const saved = link("saved", "https://example.com/threadsift-script");

    const refused = await world.folder.run(
      ["save", link("refused", "http://127.0.0.1/")],
      world.env(),
    );

    assert.equal(await run(["save", saved]), "ok");
    assert.equal(await run(["save", saved]), "duplicate");
    assert.equal(refused.word, "invalid");
    assert.notEqual(refused.reasons, "");
    assert.equal(await run(["save", link("text", "not a link")]), "bad-input");
  });

  it("saves an X link with its thread from a file, and refuses a thread that is not the link's post", async () => {
    const x = link("x", `https://x.com/someone/status/${STATUS_ID}`);
    const thread = world.folder.tmpFile("thread.json", intakeThread(STATUS_ID));
    const wrong = world.folder.tmpFile("wrong.json", "not a thread");

    assert.equal(await run(["save", x, thread]), "ok");
    assert.equal(await run(["save", x, thread]), "duplicate");
    assert.equal((await world.folder.run(["save", x, wrong], world.env())).word, "invalid");
  });

  it("writes the matches of a search to tmp/search.json and prints ok, and none for a search that finds nothing", async () => {
    await world.instance.tick();

    const found = await run(["search", link("query", "backup")]);

    const file = SearchFileSchema.parse(
      JSON.parse(readFileSync(join(world.folder.path, "tmp", "search.json"), "utf8")),
    );

    assert.equal(found, "ok");
    assert.equal(await run(["search", link("nothing", "zzzqqqxxx")]), "none");
    assert.ok(file.items.length > 0);
    assert.equal(await run(["search", link("long", "a".repeat(201))]), "invalid");
  });

  it("writes the Topics of the library to tmp/topics.json and prints ok", async () => {
    await world.instance.tick();

    assert.equal(await run(["topics"]), "ok");

    const index = TopicIndexSchema.parse(
      JSON.parse(readFileSync(join(world.folder.path, "tmp", "topics.json"), "utf8")),
    );

    assert.ok(index.topics.length > 0);
  });

  it("answers bad-input for a command the script does not offer, a search without a file and a task id that is not a number", async () => {
    assert.equal(await run(["bogus"]), "bad-input");
    assert.equal(await run(["task-get", "1"]), "bad-input");
    assert.equal(await run(["task-intake", "1", "x"]), "bad-input");
    assert.equal(await run(["search"]), "bad-input");
    assert.equal(await run(["task-answer", "abc", link("any", "{}")]), "bad-input");
  });
});
