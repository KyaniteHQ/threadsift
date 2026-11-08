import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { ESSAY } from "./articles.ts";
import { sendDigest } from "./catalog.ts";
import { answer, choice, expectRows, group } from "./filters.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP } from "./look.ts";

const FILL_TIMEOUT_MS = 480_000;

test.describe.configure({ mode: "serial", timeout: FILL_TIMEOUT_MS });

test.use({ trace: "off", video: "off", screenshot: "off" });

interface Folded {
  readonly label: string;
  readonly spellings: readonly string[];
}

const ISTANBUL_SPELLINGS = ["\u0130stanbul", "Istanbul", "istanbul", "i\u0307stanbul"];

const FOLDED: readonly Folded[] = [
  { label: "sharp s", spellings: ["Straße", "STRASSE", "strasse"] },
  { label: "final sigma", spellings: ["ΟΔΟΣ", "οδος", "οδοσ"] },
  { label: "dotted I", spellings: ISTANBUL_SPELLINGS },
  { label: "canonical equivalents", spellings: ["R\u00E9sum\u00E9", "Re\u0301sume\u0301"] },
  { label: "compatibility forms", spellings: ["\uFB01ne Tools", "\uFF26\uFF29\uFF2E\uFF25 tools"] },
  { label: "spacing", spellings: ["Deep  Work", "deep work", "Deep\u00A0Work"] },
];

const APART: readonly (readonly [string, string])[] = [
  ["café", "cafe"],
  ["şiir", "siir"],
  ["öl", "ol"],
  ["ısı", "isi"],
];

let screen: FreshScreen;

const idsBySpelling = new Map<string, number>();

let sequence = 0;

async function save(topic: string): Promise<number> {
  sequence += 1;

  const item = await sendDigest(screen, `${ESSAY}?folding=${sequence}`, {
    topic,
    tags: [topic],
  });

  idsBySpelling.set(topic, item.id);

  return item.id;
}

async function saveInOrder(spellings: readonly string[]): Promise<void> {
  for (const spelling of spellings) {
    await save(spelling);
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(FILL_TIMEOUT_MS);
  screen = await openSignedIn(browser, newCode(), newPassword());
  await Promise.all([
    ...FOLDED.map(({ spellings }) => saveInOrder(spellings)),
    saveInOrder(APART.flat()),
  ]);
});

test.afterAll(async () => {
  await screen.close();
});

function idsOf(spellings: readonly string[]): number[] {
  return spellings.map((spelling) => idsBySpelling.get(spelling) ?? 0).toSorted((a, b) => a - b);
}

function countsByName(rows: readonly { readonly name: string; readonly count: number }[]) {
  const byName = new Map<string, number>();

  for (const { name, count } of rows) byName.set(name, count);

  return byName;
}

function expectedCounts() {
  const byName = new Map<string, number>();

  for (const { spellings } of FOLDED) byName.set(spellings[0] ?? "", spellings.length);

  for (const spelling of APART.flat()) byName.set(spelling, 1);

  return byName;
}

test("spellings that differ only in case, accents composition, width or spacing make one Topic and one Tag with the first spelling, and the filters count them together", async () => {
  const { request } = screen.context;
  const { counts, items } = await answer(request, {});

  expect(countsByName(counts.topics)).toEqual(expectedCounts());
  expect(countsByName(counts.tags)).toEqual(expectedCounts());

  for (const { label, spellings } of FOLDED) {
    const first = spellings[0] ?? "";
    const wanted = idsOf(spellings);

    for (const item of items.filter(({ id }) => wanted.includes(id))) {
      expect(item.digestTopic, `${label} shows the first spelling`).toBe(first);
    }

    for (const spelling of spellings) {
      const byTopic = await answer(request, { topic: spelling });
      const byTag = await answer(request, { tag: spelling });

      expect(
        byTopic.items.map(({ id }) => id).toSorted((a, b) => a - b),
        label,
      ).toEqual(wanted);
      expect(
        byTag.items.map(({ id }) => id).toSorted((a, b) => a - b),
        label,
      ).toEqual(wanted);
    }
  }
});

test("café and cafe, ş and s, ö and o, ı and i stay separate Topics and Tags", async () => {
  const { request } = screen.context;

  for (const [accented, plain] of APART) {
    for (const spelling of [accented, plain]) {
      const wanted = idsOf([spelling]);

      expect(
        (await answer(request, { topic: spelling })).items.map(({ id }) => id),
        spelling,
      ).toEqual(wanted);

      expect(
        (await answer(request, { tag: spelling })).items.map(({ id }) => id),
        spelling,
      ).toEqual(wanted);
    }
  }
});

test("the filter pane lists each folded Topic and Tag once under its first spelling, with the folded count, and its choice leaves exactly those rows", async () => {
  const { page } = screen;
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  await page.getByRole("button", { name: `All ${expectedCounts().size} topics` }).click();
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  await page.getByRole("button", { name: `All ${expectedCounts().size} tags` }).click();

  for (const filter of ["Topic", "Tags"]) {
    const names = await group(page, filter).locator(".fl-row bdi").allTextContents();

    expect(names.toSorted(), filter).toEqual([...expectedCounts().keys()].toSorted());

    const istanbul = choice(page, filter, "İstanbul");

    await expect(istanbul.locator(".fl-n")).toHaveText("4");
    await istanbul.click();
    await expectRows(page, idsOf(ISTANBUL_SPELLINGS));
    await istanbul.click();
  }
});
