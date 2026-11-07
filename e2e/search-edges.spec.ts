import { expect, test } from "@playwright/test";
import { z } from "zod";

import { newCode, newPassword } from "./access.ts";
import { postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import { unlinkDigests } from "./catalog.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { sweepNow } from "./ingest.ts";
import {
  CHUNK_UNITS,
  SWEEP_TIMEOUT_MS,
  digestOf,
  expectFinds,
  idAt,
  matches,
  partsOf,
  seedItem,
  sweptTo,
} from "./search.ts";

let screen: FreshScreen;

test.describe.configure({ timeout: 480_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

const RACING_URL = "https://example.com/racing";
const PLAIN_URL = "https://example.com/plain";

function fetchLandsMidSweep(): void {
  const body = `WHEN (SELECT post_text FROM items WHERE normalized_url = '${RACING_URL}') = 'alphaword' BEGIN DELETE FROM search_parts WHERE kind = 'post-text' AND item_id IN (SELECT id FROM items WHERE normalized_url = '${RACING_URL}'); INSERT INTO search_parts (item_id, kind, body) SELECT id, 'post-text', 'bravoword' FROM items WHERE normalized_url = '${RACING_URL}'; UPDATE items SET post_text = 'bravoword' WHERE normalized_url = '${RACING_URL}'; END`;

  screen.fresh.sql(
    `CREATE TRIGGER fetch_after_insert AFTER INSERT ON search_reconciling ${body}; CREATE TRIGGER fetch_after_update AFTER UPDATE ON search_reconciling ${body}`,
  );
}

function fingerprintCount(id: number): number {
  const [row] = screen.fresh.query(
    `SELECT count(*) AS n FROM search_fingerprints WHERE item_id = ${id}`,
    z.array(z.object({ n: z.number() })),
  );

  return row?.n ?? 0;
}

test("a fetch that commits after the sweep read an Item leaves that fetch's search parts in place", async () => {
  const { request } = screen.context;
  fetchLandsMidSweep();
  seedItem(screen, { url: RACING_URL, title: "Racing title", postText: "'alphaword'" });
  seedItem(screen, { url: PLAIN_URL, title: "Plain title", postText: "'plainword'" });
  const racing = idAt(screen, RACING_URL);
  const plain = idAt(screen, PLAIN_URL);

  await sweepNow(request, screen.fresh);
  await expect.poll(() => fingerprintCount(plain), { timeout: SWEEP_TIMEOUT_MS }).toBe(1);

  await expectFinds(request, [
    ["alphaword", []],
    ["bravoword", [racing]],
    ["plainword", [plain]],
  ]);
});

test("query words split where the index tokenizer splits, and keep accents that it folds", async () => {
  const { request } = screen.context;
  const split = "https://example.com/split";
  const decomposed = "https://example.com/decomposed";
  const composed = "https://example.com/composed";
  seedItem(screen, { url: split, title: "food", postText: "'barley'" });
  seedItem(screen, { url: decomposed, title: "cafe\u0301 au lait" });
  seedItem(screen, { url: composed, title: "caf\u00E9 noir" });

  const [food, latte, noir] = [
    idAt(screen, split),
    idAt(screen, decomposed),
    idAt(screen, composed),
  ];

  await sweptTo(screen, "barley", [food]);

  await expectFinds(request, [
    ["foo bar", [food]],
    ["foo\u0903bar", [food]],
    ["foo\u0332bar", [food]],
    ["cafe", [latte, noir]],
    ["caf\u00E9", [latte, noir]],
    ["cafe\u0301", [latte, noir]],
    ["cafe\u0332", [latte, noir]],
    ["\u0301", [food, latte, noir]],
    ["\u0903", [food, latte, noir]],
  ]);
});

test("a hard cut never splits a character made of two UTF-16 units", async () => {
  const url = "https://example.com/surrogate";

  seedItem(screen, {
    url,
    title: "Surrogate title",
    postText: `replace(hex(zeroblob(${CHUNK_UNITS - 1})), '00', 'a') || char(66560) || 'zebra ' || replace(hex(zeroblob(100000)), '00', 'word ')`,
  });

  const id = idAt(screen, url);
  await sweptTo(screen, "surrogate", [id]);
  const chunks = partsOf(screen, id).filter(({ kind }) => kind === "post-text");
  expect(chunks.length).toBeGreaterThan(2);
  expect(chunks[0]?.length).toBe(CHUNK_UNITS - 1);

  const [broken] = screen.fresh.query(
    `SELECT count(*) AS n FROM search_parts WHERE item_id = ${id} AND instr(body, char(65533)) > 0`,
    z.array(z.object({ n: z.number() })),
  );

  expect(broken?.n).toBe(0);
});

test("linking an older Digest restores its Tag part in the same batch, without the sweep's rebuild", async () => {
  const { request } = screen.context;
  const sent = await postLinkRaw(request, ESSAY, digestOf("Older title", "Keptlink", "Older."));
  const id = (await settled(request, sent.body.item.id, 180_000)).id;
  await sweepNow(request, screen.fresh);
  await expect.poll(() => fingerprintCount(id), { timeout: SWEEP_TIMEOUT_MS }).toBe(1);

  unlinkDigests(screen, [id]);
  screen.fresh.sql(`DELETE FROM search_parts WHERE item_id = ${id} AND kind = 'tags'`);
  expect(await matches(request, "keptlink")).toEqual([]);

  await sweptTo(screen, "keptlink", [id]);
  expect(partsOf(screen, id).map(({ kind }) => kind)).toContain("tags");
});
