import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Instance, ORIGIN } from "./instance.ts";
import { createAgentToken } from "./mcp-client.ts";
import { xLink } from "./token-budget-fixtures.ts";

const addressOf = (query: Readonly<Record<string, string>>) =>
  `/?${new URLSearchParams(query).toString()}`;

const linkInBox = (value: string) => addressOf({ link: value });

const OWN_PAGE = { origin: ORIGIN, "sec-fetch-site": "same-origin" } as const;

describe("a share from the installed app saves the link only for a signed-in owner whose request came from the app's own page", () => {
  let instance: Instance;
  let ownerCookie: string;
  let tokenValue: string;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    ownerCookie = instance.ownerCookie;
    tokenValue = (await createAgentToken(instance, "shares", ["read", "add"])).value;
  });

  after(() => instance.close());

  const share = async (
    fields: Readonly<Record<string, string>>,
    headers: Readonly<Record<string, string>>,
  ) => {
    const response = await instance.fetch("/share", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
      body: new URLSearchParams(fields).toString(),
    });

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("cache-control"), "no-store");

    return response.headers.get("location");
  };

  it("saves the link at once, opens the library on that Item, and opens a known link on the same Item as refreshed", async () => {
    const link = xLink(1);
    const total = await instance.itemTotal();

    const first = await share({ url: link }, { ...OWN_PAGE, cookie: ownerCookie });
    const id = Number(/^\/\?saved=(?<id>[1-9]\d*)$/u.exec(first ?? "")?.groups?.["id"]);

    assert.ok(id > 0, `the answer is /?saved=<id>, not ${String(first)}`);
    assert.equal((await instance.detail(id)).originalUrl, link);
    assert.equal(await instance.itemTotal(), total + 1);

    await instance.settledItem(id);

    const again = await share({ url: link }, { ...OWN_PAGE, cookie: ownerCookie });

    assert.equal(again, `/?refreshed=${String(id)}`);
    assert.equal(await instance.itemTotal(), total + 1);
  });

  const untrusted = [
    { name: "a form on another site", headers: { ...OWN_PAGE, "sec-fetch-site": "cross-site" } },
    {
      name: "a page on another port of the same site",
      headers: { ...OWN_PAGE, "sec-fetch-site": "same-site" },
    },
    { name: "a request that lacks Sec-Fetch-Site", headers: { origin: ORIGIN } },
    { name: "a request that lacks Origin", headers: { "sec-fetch-site": "same-origin" } },
    {
      name: "an Origin that names another host",
      headers: { ...OWN_PAGE, origin: "http://evil.test" },
    },
    { name: "an Origin of null", headers: { ...OWN_PAGE, origin: "null" } },
  ] as const;

  it("writes nothing for a request that is not from the app's own page, and opens the library with the link in the paste box", async () => {
    const link = xLink(2);
    const total = await instance.itemTotal();

    const answers = await Promise.all(
      untrusted.map(async ({ name, headers }) => ({
        name,
        location: await share({ url: link }, { ...headers, cookie: ownerCookie }),
      })),
    );

    assert.deepEqual(
      answers,
      untrusted.map(({ name }) => ({ name, location: linkInBox(link) })),
    );
    assert.equal(await instance.itemTotal(), total);
  });

  it("writes nothing while signed out, and for an agent token that sends the page's headers", async () => {
    const link = xLink(3);
    const total = await instance.itemTotal();

    const signedOut = await share({ url: link }, OWN_PAGE);
    const withToken = await share(
      { url: link },
      { ...OWN_PAGE, authorization: `Bearer ${tokenValue}` },
    );

    assert.deepEqual(signedOut, linkInBox(link));
    assert.deepEqual(withToken, signedOut);
    assert.equal(await instance.itemTotal(), total);
  });

  it("writes nothing for a GET, whose link comes from the query", async () => {
    const link = xLink(4);
    const total = await instance.itemTotal();

    const response = await instance.fetch(`/share?url=${encodeURIComponent(link)}`, {
      headers: { ...OWN_PAGE, cookie: ownerCookie },
    });

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), linkInBox(link));
    assert.equal(await instance.itemTotal(), total);
  });
});

describe("a share takes the first http or https address of its url, text or title, in that order, without trailing punctuation", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
  });

  after(() => instance.close());

  const prefillOf = async (query: Readonly<Record<string, string>>) => {
    const response = await instance.fetch(`/share?${new URLSearchParams(query).toString()}`);

    return response.headers.get("location");
  };

  it("prefers the url field over the text, and the text over the title", async () => {
    const [fromUrl, fromText, fromTitle] = await Promise.all([
      prefillOf({
        url: "https://a.test/one",
        text: "see https://b.test/two",
        title: "https://c.test/three",
      }),
      prefillOf({ text: "see https://b.test/two", title: "https://c.test/three" }),
      prefillOf({ title: "read https://c.test/three now" }),
    ]);

    assert.deepEqual(fromUrl, linkInBox("https://a.test/one"));
    assert.deepEqual(fromText, linkInBox("https://b.test/two"));
    assert.deepEqual(fromTitle, linkInBox("https://c.test/three"));
  });

  it("takes the first address of a field and drops the punctuation after it", async () => {
    const arrival = await prefillOf({
      text: "Worth a read: (https://a.test/page?x=1), and https://b.test/two.",
    });

    assert.deepEqual(arrival, linkInBox("https://a.test/page?x=1"));
  });

  it("opens the paste box with the shared words and the invalid-link notice when there is no address", async () => {
    assert.equal(
      await prefillOf({ text: "Some words without a link", title: "A title" }),
      addressOf({ link: "Some words without a link", notice: "invalid" }),
    );
  });

  it("opens the paste box empty with the empty notice when nothing is shared", async () => {
    assert.equal(await prefillOf({ text: "  ", title: "" }), addressOf({ notice: "empty" }));
  });
});
