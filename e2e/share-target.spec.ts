import { expect } from "@playwright/test";

import { ItemListResponseSchema } from "../src/http/schemas.ts";
import { NOTICES } from "../web/src/text.ts";
import { SAME_ORIGIN, agentToken, bearer, ownerContext, test } from "./access.ts";
import { listAll, listForRun, postLink, postLinkRaw, settled } from "./api.ts";
import { ADDED, REFRESHED, cardTitle } from "./card.ts";
import { addButton, newRunId, pasteCard, pasteField } from "./links.ts";
import {
  type ForeignKind,
  type Submissions,
  fetchJobCount,
  recordedInstancePerFile,
  shareFromThisPage,
  foreignSitesPerFile,
} from "./share.ts";

const NEW_CARD_MS = 30_000;

const foreign = foreignSitesPerFile();
const recorded = recordedInstancePerFile();

function submissionsSince(start: Submissions): Submissions {
  const now = recorded().submissions();

  return { share: now.share - start.share, items: now.items - start.items };
}

test("a trusted share saves the link from the text, refreshes it on a second share and never submits again", async ({
  browser,
  request,
}) => {
  const run = newRunId();
  const link = `https://example.com/${run}/trusted?a=1#y`;
  const text = `Look at this ${link}.`;
  const start = recorded().submissions();
  const context = await ownerContext(browser, { baseURL: recorded().url });
  const page = await context.newPage();

  await page.goto("/");
  await expect(pasteField(page)).toBeVisible();
  await shareFromThisPage(page, { text });
  await pasteCard(page).hover();
  await expect(cardTitle(page)).toHaveText(ADDED, { timeout: NEW_CARD_MS });
  await expect(page).toHaveURL(`${recorded().url}/`);

  const [item] = await listForRun(request, run);
  expect(item?.originalUrl).toBe(link);
  const id = item?.id ?? 0;
  await settled(request, id);
  expect(fetchJobCount(id)).toBe(1);

  await shareFromThisPage(page, { text });
  await pasteCard(page).hover();
  await expect(cardTitle(page)).toHaveText(REFRESHED, { timeout: NEW_CARD_MS });
  expect(await listForRun(request, run)).toHaveLength(1);
  await settled(request, id);
  expect(fetchJobCount(id)).toBe(2);
  expect(submissionsSince(start), "submissions the server received so far").toEqual({
    share: 2,
    items: 0,
  });

  await page.reload();
  await expect(pasteField(page)).toBeVisible();
  await page.goBack();
  await expect(pasteField(page)).toBeVisible();
  await page.goForward();
  await expect(pasteField(page)).toBeVisible();
  await expect(pasteCard(page)).toHaveCount(0);
  expect(submissionsSince(start), "submissions the server received in all").toEqual({
    share: 2,
    items: 0,
  });
  expect(fetchJobCount(id), "fetch jobs the server opened").toBe(2);
  await context.close();
});

test("a forged address at /?saved= or /?link= makes the server receive no save, and Add makes one", async ({
  browser,
  request,
}) => {
  const run = newRunId();
  const known = (await postLink(request, `https://example.com/${run}/known`)).body.item;
  const link = `https://example.com/${run}/forged`;
  const start = recorded().submissions();
  const context = await ownerContext(browser, { baseURL: recorded().url });
  const page = await context.newPage();

  await page.goto(`/?saved=${known.id}`);
  await expect(cardTitle(page)).toHaveText(ADDED, { timeout: NEW_CARD_MS });
  await page.goto(`/?refreshed=${known.id}`);
  await expect(cardTitle(page)).toHaveText(REFRESHED, { timeout: NEW_CARD_MS });
  await page.goto(`/?link=${encodeURIComponent(link)}`);
  await expect(pasteField(page)).toHaveValue(link);
  await expect(page).toHaveURL(`${recorded().url}/`);

  expect(submissionsSince(start)).toEqual({ share: 0, items: 0 });
  expect(await listForRun(request, run)).toHaveLength(1);

  await addButton(page).click();
  await pasteCard(page).hover();
  await expect(cardTitle(page)).toHaveText(ADDED, { timeout: NEW_CARD_MS });
  expect(submissionsSince(start)).toEqual({ share: 0, items: 1 });
  expect(await listForRun(request, run)).toHaveLength(2);
  await context.close();
});

test("a trusted share with no link in any field shows the invalid-link error and stores nothing", async ({
  page,
  request,
  baseURL,
}) => {
  const before = (await listAll(request)).length;
  await page.goto("/");
  await expect(pasteField(page)).toBeVisible();
  await shareFromThisPage(page, { title: "Notes", text: "just some words, no link" });

  await expect(pasteCard(page)).toContainText(NOTICES.invalid.text);
  await expect(pasteField(page)).toHaveValue("just some words, no link");
  await expect(page).toHaveURL(`${baseURL}/`);
  expect(await listAll(request)).toHaveLength(before);
});

test("a trusted share of a private address shows the private notice and stores nothing", async ({
  page,
  request,
}) => {
  const before = (await listAll(request)).length;
  await page.goto("/");
  await expect(pasteField(page)).toBeVisible();
  await shareFromThisPage(page, { url: "http://127.0.0.1/private" });

  await expect(pasteCard(page)).toContainText(NOTICES.private.text);
  await expect(pasteField(page)).toHaveValue("http://127.0.0.1/private");
  expect(await listAll(request)).toHaveLength(before);
});

const ARRIVALS: readonly (readonly [string, "sameSite" | "crossSite", ForeignKind])[] = [
  ["same-site", "sameSite", "link"],
  ["same-site", "sameSite", "get-form"],
  ["same-site", "sameSite", "post-form"],
  ["cross-site", "crossSite", "link"],
  ["cross-site", "crossSite", "no-referrer-link"],
  ["cross-site", "crossSite", "get-form"],
  ["cross-site", "crossSite", "post-form"],
  ["cross-site", "crossSite", "sandboxed-form"],
];

for (const [label, side, kind] of ARRIVALS) {
  test(`a ${kind} from a ${label} page opens the library with the link in the paste box and saves it only on Add`, async ({
    page,
    request,
    baseURL,
  }) => {
    const run = newRunId();
    const link = `https://example.com/${run}/${kind}`;
    const before = (await listAll(request)).length;

    await page.goto(foreign().pageFor(foreign()[side], kind, `See ${link} now`));
    await (
      kind === "sandboxed-form" ? page.frameLocator("iframe").locator("#go") : page.locator("#go")
    ).click();

    await expect(page).toHaveURL(`${baseURL}/`);
    await expect(pasteField(page)).toHaveValue(link);
    expect(await listAll(request)).toHaveLength(before);
    expect(await listForRun(request, run)).toHaveLength(0);

    await addButton(page).click();
    await pasteCard(page).hover();
    await expect(cardTitle(page)).toHaveText(ADDED, { timeout: NEW_CARD_MS });
    expect(await listForRun(request, run)).toHaveLength(1);
  });
}

test("a multipart share with no boundary hands off to the library with the invalid-link error and stores nothing", async ({
  request,
  baseURL,
}) => {
  const run = newRunId();
  const before = (await listAll(request)).length;

  const response = await request.post("/share", {
    headers: {
      ...SAME_ORIGIN,
      origin: baseURL ?? "",
      "content-type": "multipart/form-data",
    },
    data: `text=https://example.com/${run}/malformed`,
    maxRedirects: 0,
  });

  expect(response.status()).toBe(303);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const where = new URL(response.headers()["location"] ?? "", baseURL);
  expect(where.pathname).toBe("/");
  expect(where.searchParams.get("notice")).toBe("invalid");
  expect(await listAll(request)).toHaveLength(before);
});

const PREFILL_LIMIT = 1000;

test("a link of 3,000 characters from another site is cut to 1,000 in the paste box with the invalid-link error", async ({
  page,
  request,
  baseURL,
}) => {
  const run = newRunId();
  const link = `https://example.com/${run}/${"a".repeat(3000)}`;
  const before = (await listAll(request)).length;

  await page.goto(foreign().pageFor(foreign().crossSite, "post-form", link));
  await page.locator("#go").click();

  await expect(page).toHaveURL(`${baseURL}/`);
  await expect(pasteField(page)).toHaveValue(link.slice(0, PREFILL_LIMIT));
  await expect(pasteCard(page)).toContainText(NOTICES.invalid.text);
  expect(await listAll(request)).toHaveLength(before);
});

test("1,000 characters that each take nine bytes in the address still open the library", async ({
  page,
  baseURL,
}) => {
  const words = "あ".repeat(PREFILL_LIMIT);

  await page.goto(foreign().pageFor(foreign().crossSite, "post-form", words));
  await page.locator("#go").click();

  await expect(page).toHaveURL(`${baseURL}/`);
  await expect(pasteField(page)).toHaveValue(words);
  await expect(pasteCard(page)).toContainText(NOTICES.invalid.text);
});

const HEADERS: readonly (readonly [string, Readonly<Record<string, string>>, boolean])[] = [
  ["no metadata", {}, false],
  ["Sec-Fetch-Site alone", SAME_ORIGIN, false],
  ["same-site", { "sec-fetch-site": "same-site", origin: "http://placeholder" }, false],
  ["cross-site", { "sec-fetch-site": "cross-site", origin: "http://placeholder" }, false],
  ["an opaque origin", { ...SAME_ORIGIN, origin: "null" }, false],
  ["another origin", { ...SAME_ORIGIN, origin: "http://127.0.0.1:9" }, false],
  ["the right metadata", { ...SAME_ORIGIN, origin: "http://placeholder" }, true],
];

for (const [label, headers, saves] of HEADERS) {
  test(`a share with the owner's cookie and ${label} ${saves ? "saves" : "only fills the paste box"}`, async ({
    request,
    baseURL,
  }) => {
    const run = newRunId();
    const link = `https://example.com/${run}/header`;

    const sent = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        name,
        value === "http://placeholder" ? (baseURL ?? "") : value,
      ]),
    );

    const response = await request.post("/share", {
      form: { text: link },
      headers: sent,
      maxRedirects: 0,
    });

    expect(response.status()).toBe(303);
    const where = new URL(response.headers()["location"] ?? "", baseURL);
    expect(where.pathname).toBe("/");
    expect(where.searchParams.get("link") !== null).toBe(!saves);
    expect(where.searchParams.has("saved")).toBe(saves);
    expect(await listForRun(request, run)).toHaveLength(saves ? 1 : 0);
  });
}

test("an agent token alone never saves through the share action, while the API still takes it", async ({
  stranger,
  baseURL,
}) => {
  const run = newRunId();
  const link = `https://example.com/${run}/token`;
  const token = bearer(agentToken());

  const shared = await stranger.post("/share", {
    form: { text: link },
    headers: { ...token, ...SAME_ORIGIN, origin: baseURL ?? "" },
    maxRedirects: 0,
  });

  expect(shared.status()).toBe(303);
  expect(new URL(shared.headers()["location"] ?? "", baseURL).searchParams.get("link")).toBe(link);
  const listed = await stranger.get("/api/items", { headers: token });
  const stored = ItemListResponseSchema.parse(await listed.json()).items;
  expect(stored.filter((item) => item.normalizedUrl.includes(run))).toHaveLength(0);

  const saved = await postLinkRaw(stranger, link, undefined, token);
  expect(saved.status).toBe(201);
  expect(saved.body.item.originalUrl).toBe(link);
});
