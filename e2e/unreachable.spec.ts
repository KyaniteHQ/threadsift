import { expect, test } from "@playwright/test";

import { postLinkRaw, settled } from "./api.ts";
import { forgetItem, STALLED } from "./ingest.ts";

const NO_SUCH_HOST = "https://threadsift-demo.invalid/";

const CLOSED_REASONS = ["timeout", "network", "gave-up"];

test("a host that does not resolve ends a new Item failed with a network fetch and no title", async ({
  request,
}) => {
  forgetItem(NO_SUCH_HOST);
  const { body } = await postLinkRaw(request, NO_SUCH_HOST);

  expect(body.item.status).toBe("processing");

  const item = await settled(request, body.item.id);

  expect(item).toMatchObject({ status: "failed", title: null, fetch: "network" });
  expect(CLOSED_REASONS).toContain(item.reason);
});

test("a port that never answers ends a new Item failed with a reason from the closed list", async ({
  request,
}) => {
  test.setTimeout(60_000);
  forgetItem(STALLED);
  const { body } = await postLinkRaw(request, STALLED);

  const item = await settled(request, body.item.id);

  expect(item.status).toBe("failed");
  expect(CLOSED_REASONS).toContain(item.reason);
  expect(item.title).toBeNull();
});
