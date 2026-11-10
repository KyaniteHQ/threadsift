import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { NOTICES } from "../web/src/text.ts";
import { SAME_ORIGIN } from "./access.ts";
import {
  attemptStep,
  count,
  marker,
  runStep,
  started,
  stored,
  stoppedBeforeRenames,
} from "./identity-run.ts";
import { ALICE_POSTED, BEFORE_IDENTITY, FAILING_BEFORE, ITEMS, RENAMED } from "./identity-seed.ts";
import { addButton, pasteCard, pasteField } from "./links.ts";
import { shareFromThisPage } from "./share.ts";

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
    expect(marker(instance)).toEqual([{ name: "item-identity", version: 2, cursor: null }]);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});

test("a paste while another run holds the step lease waits for that run to end, then finishes the step and saves", async () => {
  const { instance, owner } = await started(FAILING_BEFORE);

  try {
    await attemptStep(owner, instance);
    instance.sql("DROP TRIGGER stop_batch");
    instance.sql(
      "INSERT INTO data_step_lease (id, holder, expires_at) VALUES (1, 'another-run', 9007199254740991)",
    );
    await attemptStep(owner, instance);

    const paste = pasteAlice(owner);
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
    instance.sql("DELETE FROM data_step_lease");

    const found = await paste;

    expect([found.status, found.id]).toEqual([200, 1]);
    expect(stored(instance).at(0)?.normalized_url).toBe(RENAMED[0][1]);
    expect(count(instance, "SELECT 1 FROM data_step_lease")).toBe(0);
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
    expect(shared.headers()["location"]).toContain("notice=updating");
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

test("while another run holds the step lease, a paste is refused and no Item is renamed, and the step finishes once the lease is gone", async () => {
  const { instance, owner } = await started(FAILING_BEFORE);

  try {
    await attemptStep(owner, instance);
    instance.sql("DROP TRIGGER stop_batch");
    instance.sql(
      "INSERT INTO data_step_lease (id, holder, expires_at) VALUES (1, 'another-run', 9007199254740991)",
    );

    await attemptStep(owner, instance);

    const refused = await pasteAlice(owner);

    expect(refused.status).toBe(503);
    expect(marker(instance).at(0)?.version).not.toBe(2);
    expect(stored(instance).at(0)?.normalized_url).toBe(ITEMS[0][3]);

    instance.sql("DELETE FROM data_step_lease");
    await runStep(owner, instance);

    const found = await pasteAlice(owner);

    expect([found.status, found.id]).toEqual([200, 1]);
    expect(stored(instance).at(0)?.normalized_url).toBe(RENAMED[0][1]);
    expect(count(instance, "SELECT 1 FROM data_step_lease")).toBe(0);
  } finally {
    await owner.dispose();
    instance.stop();
  }
});

test("a paste and a share during a step that cannot finish show why the link was not saved and keep the link in the field", async ({
  browser,
}) => {
  const { instance, owner } = await stoppedBeforeRenames(FAILING_BEFORE);

  const context = await browser.newContext({
    baseURL: instance.url,
    storageState: await owner.storageState(),
  });

  try {
    const page = await context.newPage();
    await page.goto("/");

    await pasteField(page).fill(ALICE_POSTED);
    await addButton(page).click();

    await expect(pasteCard(page)).toContainText(NOTICES.updating.text);
    await expect(pasteField(page)).toHaveValue(ALICE_POSTED);

    await page.goto("/");
    await shareFromThisPage(page, { url: ALICE_POSTED });

    await expect(pasteCard(page)).toContainText(NOTICES.updating.text);
    await expect(pasteField(page)).toHaveValue(ALICE_POSTED);
    expect(count(instance, "SELECT 1 FROM items")).toBe(17);
  } finally {
    await context.close();
    await owner.dispose();
    instance.stop();
  }
});
