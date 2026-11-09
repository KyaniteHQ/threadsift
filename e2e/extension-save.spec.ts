import { expect, test } from "@playwright/test";

import { itemOf, postLink } from "./api.ts";
import {
  configuredExtensionSession,
  expectTabImages,
  ready,
  savedItemId,
} from "./extension-session.ts";
import { RESPONSIVE_PAGE, SHARED_WIDTHS_PAGE, SMALL_PAGE } from "./media-pages.ts";
import { imageRows, routesIn } from "./media.ts";

test.describe.configure({ timeout: 300_000 });

const QUOTES_PAGE = "https://quotes.toscrape.com/js/";
const QUOTE = "The world as we have created it is a process of our thinking";

const session = configuredExtensionSession();

test("the action saves the article in the current tab with the title, author, date, links and images the tab shows", async () => {
  const { library, extension } = session();
  const { owner, instance } = library;
  const tab = await extension.tab(SMALL_PAGE);
  await expect(tab.getByRole("heading", { name: "Microservices", level: 1 })).toBeVisible();

  const id = await savedItemId(await extension.press(tab), instance.url);
  const item = await ready(owner, id);

  expect(item).toMatchObject({
    source: "article",
    kind: "article",
    fetch: "ok",
    normalizedUrl: SMALL_PAGE,
  });
  expect(item.title).toBe(await tab.title());
  expect(item.postText, "a link in the saved text").toMatch(/\]\(https:\/\/martinfowler\.com\//u);
  expect(item.postText, "no relative link in the saved text").not.toMatch(
    /\]\((?!https?:|\/api\/)/u,
  );

  await expect
    .poll(() => imageRows(instance, id).filter(({ outcome }) => outcome === "stored").length)
    .toBeGreaterThanOrEqual(5);

  await expectTabImages(tab, imageRows(instance, id));

  for (const row of imageRows(instance, id)) {
    expect(row.source_url, "the address of an image row").toMatch(
      /^https:\/\/martinfowler\.com\//u,
    );
  }

  expect(routesIn(item.postText).length, "image routes in the saved text").toBeGreaterThanOrEqual(
    5,
  );
});

const RESPONSIVE_PAGES = [
  { name: "a page whose srcset lists widths without spaces", url: RESPONSIVE_PAGE },
  { name: "a page whose images share srcset widths", url: SHARED_WIDTHS_PAGE },
];

async function expectOwnSelectedImages(url: string): Promise<void> {
  const { library, extension } = session();
  const { owner, instance } = library;
  const tab = await extension.tab(url);

  await expect(tab.getByRole("heading", { level: 1 })).toBeVisible();

  const selected = await tab.evaluate(async () => {
    const images = [
      ...(document.querySelector("article") ?? document.body).querySelectorAll("img"),
    ];

    for (const image of images) {
      image.scrollIntoView();
      await image.decode().catch(() => {});
    }

    return [
      ...new Set(
        images.flatMap(({ srcset, currentSrc }) =>
          /\d+w/u.test(srcset) && currentSrc !== "" ? [currentSrc] : [],
        ),
      ),
    ];
  });

  expect(selected.length, "images with a width srcset in the article").toBeGreaterThanOrEqual(2);

  const id = await savedItemId(await extension.press(tab), instance.url);
  await ready(owner, id);

  const rows = imageRows(instance, id);

  expect(
    rows.map(({ source_url }) => source_url).filter((address) => selected.includes(address)),
    "each image keeps its own selected address, in the tab's order",
  ).toEqual(selected);
}

for (const { name, url } of RESPONSIVE_PAGES) {
  test(`the images of ${name} that the saved Item keeps are the ones the tab selected`, () =>
    expectOwnSelectedImages(url));
}

test("text a script adds to the page is saved, and a Paste of the same link that finished without it lacks it", async () => {
  const { library, extension } = session();
  const { owner, instance } = library;
  const { body } = await postLink(owner, QUOTES_PAGE);

  expect(body.item.fetch, "the Paste finished").toBe("ok");
  expect(body.item.postText ?? "", "the Paste has no text a script adds").not.toContain(QUOTE);

  const tab = await extension.tab(QUOTES_PAGE);
  await expect(tab.getByText(QUOTE).first()).toBeVisible();

  const id = await savedItemId(await extension.press(tab), instance.url);

  expect(id).toBe(body.item.id);
  await expect.poll(async () => (await itemOf(owner, id)).postText ?? "").toContain(QUOTE);
  expect(await ready(owner, id)).toMatchObject({ source: "article", fetch: "ok" });
});
