import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { aliasAnswers, parseLink } from "../src/core/contract/links.ts";
import { DAY_MS } from "../src/core/contract/time-units.ts";
import { Instance } from "./instance.ts";
import {
  FAILED,
  aliasOf,
  aliasRow,
  aliasesAt,
  failedUnder,
  fetchJobsOf,
  fetchesAt,
  firstResolved,
  redditComment,
  redditPost,
  repasted,
  resolvedTo,
  stagedStaleAlias,
  stillAtShareLink,
  withEachExisting,
} from "./short-link-fixtures.ts";
import { xLink } from "./token-budget-fixtures.ts";

describe("a short link whose alias ends at a Reddit share link is resolved again, and its Link-only Item follows it to the post", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  const MOVES = [
    { existing: "refresh", address: redditPost("movesrefresh"), kind: "reddit-post", fetches: 1 },
    {
      existing: "keep",
      address: redditComment("moveskeep", "c1"),
      kind: "reddit-comment",
      fetches: 0,
    },
  ] as const;

  MOVES.forEach(({ existing, address, kind, fetches }) => {
    it(`moves the Item to the ${kind} a ${existing} Paste resolves to, closes the fetch job still open at the share link, and queues ${String(fetches)} fetch at the new address`, async () => {
      const short = `https://t.co/moves${existing}`;
      const stale = await stagedStaleAlias(instance, short);

      instance.database.exec(
        "update jobs set state = 'queued', next_attempt_at = ? where item_id = ?",
        Date.now() + DAY_MS,
        stale.id,
      );

      const total = await instance.itemTotal();
      const saved = await repasted(instance, short, resolvedTo(address), existing);

      assert.ok(saved !== null && saved.item.id === stale.id && !saved.created);
      assert.equal(await instance.itemTotal(), total);

      const item = await instance.detail(stale.id);

      assert.deepEqual(
        [item.normalizedUrl, item.source, item.kind, item.readState],
        [parseLink(address).normalizedUrl, "reddit", kind, "read"],
      );
      assert.deepEqual(aliasesAt(instance, short), [aliasRow(short, address, stale.id)]);
      assert.deepEqual(
        fetchJobsOf(instance, stale.id)
          .filter((job) => job.address === stale.share)
          .map((job) => job.state),
        ["done"],
      );
      assert.equal(fetchesAt(instance, stale.id, address), fetches);
    });

    it(`moves the alias to the Item that already holds the post a ${existing} Paste resolves to, and leaves the Link-only Item under the share link`, async () => {
      const short = `https://t.co/holder${existing}`;
      const post = redditPost(`holder${existing}`);
      const held = await firstResolved(instance, `https://t.co/holds${existing}`, post);
      const stale = await stagedStaleAlias(instance, short);
      const total = await instance.itemTotal();

      assert.ok(held !== null);

      const saved = await repasted(instance, short, resolvedTo(post), existing);

      assert.ok(saved !== null && saved.item.id === held.item.id && !saved.created);
      assert.equal(await instance.itemTotal(), total);
      await stillAtShareLink(instance, stale.id, stale.share);
      assert.deepEqual(aliasesAt(instance, short), [aliasRow(short, post, held.item.id)]);
    });
  });

  it("moves the Item once when a second short link also holds a stale alias to it, and gives the second link a new Item", async () => {
    const [first, second] = ["https://t.co/twoaliasesa", "https://t.co/twoaliasesb"];
    const [firstPost, secondPost] = [redditPost("twoaliasesa"), redditPost("twoaliasesb")];
    const stale = await stagedStaleAlias(instance, first);

    await firstResolved(instance, second, stale.share);
    await instance.settledItem(stale.id);

    const movedFirst = await repasted(instance, first, resolvedTo(firstPost));
    const movedSecond = await repasted(instance, second, resolvedTo(secondPost));

    assert.ok(movedFirst !== null && movedFirst.item.id === stale.id);
    assert.ok(movedSecond !== null && movedSecond.created && movedSecond.item.id !== stale.id);
    assert.equal(
      (await instance.detail(stale.id)).normalizedUrl,
      parseLink(firstPost).normalizedUrl,
    );
    assert.deepEqual(aliasesAt(instance, first), [aliasRow(first, firstPost, stale.id)]);
    assert.deepEqual(aliasesAt(instance, second), [
      aliasRow(second, secondPost, movedSecond.item.id),
    ]);
  });

  it("moves only the Link-only Item that holds the stale alias when another failed Item sits under the short link", async () => {
    const short = "https://t.co/twoeligible";
    const share = "https://www.reddit.com/r/library/s/twoeligible";
    const target = redditPost("twoeligible");
    const failed = await failedUnder(instance, short);
    const held = await firstResolved(instance, "https://t.co/twoeligibleother", share);

    assert.ok(failed !== null && held !== null);
    await instance.settledItem(held.item.id);

    const aliased = await firstResolved(instance, short, share);

    assert.ok(aliased !== null && aliased.item.id === held.item.id);

    const saved = await repasted(instance, short, resolvedTo(target));

    assert.ok(saved !== null && saved.item.id === held.item.id && !saved.created);
    assert.equal(
      (await instance.detail(failed.item.id)).normalizedUrl,
      parseLink(short).normalizedUrl,
    );
    assert.deepEqual(aliasesAt(instance, short), [aliasRow(short, target, held.item.id)]);
  });

  const KEPT = [
    { answer: "a community page", resolution: resolvedTo("https://www.reddit.com/r/library/") },
    { answer: "an X post", resolution: resolvedTo(xLink(921)) },
    { answer: "a failed resolution", resolution: FAILED },
  ];

  withEachExisting(KEPT).forEach(({ answer, resolution, existing }) => {
    it(`keeps the Item and the alias when the short link now leads to ${answer} and the Paste is ${existing}`, async () => {
      const short = `https://t.co/keeps${answer.split(" ").at(-1) ?? ""}${existing}`;
      const stale = await stagedStaleAlias(instance, short);
      const total = await instance.itemTotal();

      const saved = await repasted(instance, short, resolution, existing);

      assert.ok(saved !== null && saved.item.id === stale.id && !saved.created);
      assert.equal(await instance.itemTotal(), total);
      await stillAtShareLink(instance, stale.id, stale.share);
      assert.deepEqual(aliasesAt(instance, short), [aliasRow(short, stale.share, stale.id)]);
      assert.equal(fetchesAt(instance, stale.id, stale.share), existing === "refresh" ? 2 : 1);
    });
  });

  const MOVED_ALREADY = [
    {
      key: "made",
      moved: "the short link that made the Item moved it and the second short link fails",
      promoter: "first",
      resolution: FAILED,
    },
    {
      key: "other",
      moved: "another short link moved the Item and the one that made it fails",
      promoter: "second",
      resolution: FAILED,
    },
    {
      key: "page",
      moved: "the second short link now leads to a community page",
      promoter: "first",
      resolution: resolvedTo("https://www.reddit.com/r/library/"),
    },
  ] as const;

  withEachExisting(MOVED_ALREADY).forEach(({ key, moved, promoter, resolution, existing }) => {
    it(`answers with the Item that another alias already moved to its post, and queues ${existing === "refresh" ? "one fetch at the Item's own address and none at the share link" : "no fetch"}, when ${moved}, for a ${existing} Paste`, async () => {
      const tag = `${key}${existing}`;
      const [first, second] = [`https://t.co/movedfirst${tag}`, `https://t.co/movedsecond${tag}`];
      const post = redditPost(`moved${tag}`);
      const stale = await stagedStaleAlias(instance, first);

      await firstResolved(instance, second, stale.share);

      const [promoting, failing] = promoter === "first" ? [first, second] : [second, first];
      const promoted = await repasted(instance, promoting, resolvedTo(post), "keep");

      assert.ok(promoted !== null && promoted.item.id === stale.id);

      const [own, total, atShareLink] = [
        parseLink(post).normalizedUrl,
        await instance.itemTotal(),
        fetchesAt(instance, stale.id, stale.share),
      ];

      const saved = await repasted(instance, failing, resolution, existing);

      assert.ok(saved !== null && saved.item.id === stale.id && !saved.created);
      assert.equal(await instance.itemTotal(), total);
      assert.equal(fetchesAt(instance, stale.id, own), existing === "refresh" ? 1 : 0);
      assert.equal(fetchesAt(instance, stale.id, stale.share), atShareLink);
      assert.deepEqual(aliasesAt(instance, failing), [aliasRow(failing, stale.share, stale.id)]);
    });
  });

  it("answers from the alias only when its address is no Reddit share link", async () => {
    const short = "https://t.co/answersfrom";
    const stale = "https://t.co/answersstale";

    await firstResolved(instance, short, redditPost("answersfrom"));
    await stagedStaleAlias(instance, stale);

    const [known, ending] = [await aliasOf(instance, short), await aliasOf(instance, stale)];

    assert.ok(known !== undefined && ending !== undefined);
    assert.equal(aliasAnswers(known.address), true);
    assert.equal(aliasAnswers(ending.address), false);
  });
});
