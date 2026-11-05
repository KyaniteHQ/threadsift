import { expect, test } from "@playwright/test";

import { listAll, postLink, refusedWith } from "./api.ts";
import { newRunId, throughRedirects } from "./links.ts";
import { type Listener, startListener } from "./listener.ts";
import { isContainerTarget } from "./target.ts";

let listener: Listener;

test.beforeAll(async () => {
  listener = await startListener();
});

test.afterAll(async () => {
  await listener.stop();
});

function refusedLinks(port: number): string[] {
  return [
    `http://127.0.0.1:${port}/`,
    `http://[::1]:${port}/`,
    `http://10.0.0.1:${port}/`,
    `http://172.16.0.1:${port}/`,
    `http://192.168.1.1:${port}/`,
    `http://0.0.0.0:${port}/`,
    `http://[64:ff9b::7f00:1]:${port}/`,
    `http://[64:ff9b:1:808:7f:0:100::]:${port}/`,
    `http://169.254.169.254:${port}/`,
    `http://100.100.100.100:${port}/`,
    `http://2130706433:${port}/`,
    `http://0x7f.1:${port}/`,
    `http://[::ffff:127.0.0.1]:${port}/`,
    `http://[fec0::1]:${port}/`,
    `http://224.0.0.1:${port}/`,
    `http://localhost:${port}/`,
    `http://localhost.:${port}/`,
    `http://x.localhost.:${port}/`,
  ];
}

function redirectTargets(port: number): string[] {
  return [
    `http://127.0.0.1:${port}/`,
    `//127.0.0.1:${port}/`,
    `http://2130706433:${port}/`,
    `http://[::ffff:7f00:1]:${port}/`,
  ];
}

test("a link to a private address gets 400 and is not stored, and the listener stays silent", async ({
  request,
}) => {
  const before = (await listAll(request)).length;
  const { port } = listener;
  await listener.expectSilent();

  for (const url of refusedLinks(port)) {
    const refused = await refusedWith(request, JSON.stringify({ url }));
    expect(refused.status, url).toBe(400);
    expect(refused.reason, url).toContain("not globally reachable");
  }

  expect(await listAll(request)).toHaveLength(before);
  await listener.expectSilent();
});

test("a public redirect to a private address saves the Item without a title and names the refusal", async ({
  request,
}) => {
  const run = newRunId();
  const { port } = listener;
  const targets = redirectTargets(port);

  const links = [1, 2].flatMap((hops) =>
    targets.map((target) => `${throughRedirects(target, hops)}&run=${run}`),
  );

  for (const url of links) {
    const { status, body } = await postLink(request, url);
    expect(status, url).toBe(201);
    expect(body.fetch, url).toBe("refused");
    expect(body.item.title, url).toBeNull();
    expect(body.item.fetchedAt, url).toBeNull();
  }

  await listener.expectSilent();
});

test("a redirect to ftp:// saves the Item without a title and names an unsupported address", async ({
  request,
}) => {
  const run = newRunId();

  const { status, body } = await postLink(
    request,
    `${throughRedirects("ftp://example.com/file", 1)}&run=${run}`,
  );

  expect(status).toBe(201);
  expect(body.fetch).toBe("unsupported");
  expect(body.item.title).toBeNull();
});

test.describe("a name that resolves to a private address", () => {
  test.skip(
    !isContainerTarget(),
    "the name check is missing on the local Worker under wrangler dev, an open item in docs/architecture.md",
  );

  test("localtest.me and a public redirect to it are refused and never reach the listener", async ({
    request,
  }) => {
    const run = newRunId();
    const { port } = listener;
    const direct = await postLink(request, `http://localtest.me:${port}/?run=${run}`);

    const redirected = await postLink(
      request,
      `${throughRedirects(`http://localtest.me:${port}/`, 1)}&run=${run}`,
    );

    for (const saved of [direct, redirected]) {
      expect(saved.status).toBe(201);
      expect(saved.body.fetch).toBe("refused");
      expect(saved.body.item.title).toBeNull();
    }

    await listener.expectSilent();
  });
});
