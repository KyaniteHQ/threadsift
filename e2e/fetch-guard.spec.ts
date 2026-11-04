import { expect, test } from "@playwright/test";

import { listAll, postLink, refusedWith } from "./api.ts";
import { newRunId } from "./links.ts";
import { type Listener, startListener } from "./listener.ts";
import { isContainerTarget } from "./target.ts";

const REDIRECTOR = "https://httpbin.dev/redirect-to?url=";

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
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://0.0.0.0/",
    "http://[64:ff9b::7f00:1]/",
    "http://169.254.169.254/",
    "http://100.100.100.100/",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fec0::1]/",
    "http://224.0.0.1/",
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
  expect(listener.seen()).toEqual(listener.controlRequests);

  for (const url of refusedLinks(port)) {
    const refused = await refusedWith(request, JSON.stringify({ url }));
    expect(refused.status, url).toBe(400);
    expect(refused.reason, url).toContain("not globally reachable");
  }

  expect(await listAll(request)).toHaveLength(before);
  expect(listener.seen()).toEqual(listener.controlRequests);
});

test("a public redirect to a private address saves the Item without a title and names the refusal", async ({
  request,
}) => {
  const run = newRunId();
  const { port } = listener;
  const targets = redirectTargets(port);

  const links = [
    ...targets.map((target) => `${REDIRECTOR}${encodeURIComponent(target)}&run=${run}`),
    ...targets.map(
      (target) =>
        `${REDIRECTOR}${encodeURIComponent(`${REDIRECTOR}${encodeURIComponent(target)}`)}&run=${run}`,
    ),
  ];

  for (const url of links) {
    const { status, body } = await postLink(request, url);
    expect(status, url).toBe(201);
    expect(body.fetch, url).toBe("refused");
    expect(body.item.title, url).toBeNull();
    expect(body.item.fetchedAt, url).toBeNull();
  }

  expect(listener.seen()).toEqual(listener.controlRequests);
});

test("a redirect to ftp:// fails with a refusal", async ({ request }) => {
  const run = newRunId();

  const { body } = await postLink(
    request,
    `${REDIRECTOR}${encodeURIComponent("ftp://example.com/file")}&run=${run}`,
  );

  expect(body.fetch).toBe("refused");
  expect(body.item.title).toBeNull();
});

test.describe("a name that resolves to a private address", () => {
  test.skip(
    !isContainerTarget(),
    "the Worker checks literal addresses and localhost only, as docs/architecture.md, Fetchers, Private addresses says",
  );

  test("localtest.me and a public redirect to it are refused and never reach the listener", async ({
    request,
  }) => {
    const run = newRunId();
    const { port } = listener;
    const direct = await postLink(request, `http://localtest.me:${port}/?run=${run}`);

    const redirected = await postLink(
      request,
      `${REDIRECTOR}${encodeURIComponent(`http://localtest.me:${port}/`)}&run=${run}`,
    );

    for (const saved of [direct, redirected]) {
      expect(saved.status).toBe(201);
      expect(saved.body.fetch).toBe("refused");
      expect(saved.body.item.title).toBeNull();
    }

    expect(listener.seen()).toEqual(listener.controlRequests);
  });
});
