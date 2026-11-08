import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { SAME_ORIGIN } from "./access.ts";
import { attemptStep, count, marker, runStep, started } from "./identity-run.ts";
import { ALICE_POSTED, BEFORE_IDENTITY, FAILING_BEFORE } from "./identity-seed.ts";

test.describe.configure({ timeout: 480_000 });

const Pasted = z.object({ item: z.object({ id: z.number() }) });

async function pasteAlice(owner: APIRequestContext) {
  const response = await owner.post("/api/items", { data: { url: ALICE_POSTED } });

  const pasted = Pasted.safeParse(await response.json());

  return { status: response.status(), id: pasted.data?.item.id };
}

test("a paste before any run of the step finishes the step first and then finds the renamed Item", async () => {
  const { instance, owner } = await started(BEFORE_IDENTITY);

  try {
    const found = await pasteAlice(owner);

    expect([found.status, found.id]).toEqual([200, 1]);
    expect(count(instance, "SELECT 1 FROM items")).toBe(17);
    expect(marker(instance)).toEqual([{ name: "item-identity", version: 1, cursor: null }]);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});

test("while the step cannot finish, reads work and every paste entry refuses, and the paste works once the step has finished", async () => {
  const { instance, owner } = await started(FAILING_BEFORE);

  try {
    await attemptStep(owner, instance);

    const list = await owner.get("/api/items");
    const refused = await pasteAlice(owner);

    const shared = await owner.post("/share", {
      form: { url: ALICE_POSTED },
      headers: { ...SAME_ORIGIN, origin: instance.url },
      maxRedirects: 0,
    });

    expect(list.status()).toBe(200);
    expect(refused.status).toBe(503);
    expect(shared.status()).toBe(303);
    expect(shared.headers()["location"]).toContain("notice=failed");
    expect(count(instance, "SELECT 1 FROM items")).toBe(17);

    instance.sql("DROP TRIGGER stop_batch");
    await runStep(owner, instance);

    const found = await pasteAlice(owner);

    expect([found.status, found.id]).toEqual([200, 1]);
    expect(count(instance, "SELECT 1 FROM items")).toBe(17);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});
