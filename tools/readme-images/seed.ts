import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

import { catalogKey } from "../../src/core/contract/catalog-key.ts";
import type { Instance } from "./instance.ts";
import { ARTICLE_ITEMS, NOTES } from "./library-articles.ts";
import { REDDIT_ITEMS } from "./library-reddit.ts";
import { X_ITEMS } from "./library-x.ts";
import { picture } from "./pictures.ts";
import type { Rig } from "./rig.ts";
import type { SeedItem } from "./seed-types.ts";
import { sequence } from "./sequence.ts";
import type { StubProvider } from "./stub-provider.ts";

const WIKI_WAIT_MS = 120_000;

const POLL_MS = 500;

const NEWEST_FIRST = [
  "four-bay",
  "ups",
  "wal",
  "backups",
  "keebs",
  "stabilizers",
  "hyphens",
  "local-first",
  "vacuum",
  "margins",
  "versions",
  "log",
];

const LIBRARY: readonly SeedItem[] = [...REDDIT_ITEMS, ...X_ITEMS, ...ARTICLE_ITEMS];

export const ITEMS: readonly SeedItem[] = NEWEST_FIRST.toReversed().flatMap((key) =>
  LIBRARY.filter((item) => item.key === key),
);

const ItemSchema = z.object({ item: z.object({ id: z.number(), status: z.string() }) });

const DetailSchema = z.object({
  item: z.object({ status: z.string(), related: z.array(z.unknown()) }),
});

const TopicSchema = z.object({
  topic: z.object({ itemCount: z.number() }),
  overview: z.object({ state: z.string(), text: z.string().nullable(), builtFrom: z.number() }),
});

export type Ids = Readonly<Record<string, number>>;

async function pasteAll(rig: Readonly<Rig>, instance: Readonly<Instance>): Promise<Ids> {
  const ids: Record<string, number> = {};

  await sequence(ITEMS, async ({ key, url, content, page, digest, accent }, index) => {
    const art =
      accent === undefined
        ? ""
        : `![${page?.title ?? ""}](${await picture(rig, accent, index % 4)})\n\n`;
    const body = {
      url,
      digest,
      content,
      page: page === undefined ? undefined : { ...page, markdown: art + page.markdown },
    };
    const saved = ItemSchema.parse(await instance.send("POST", "/api/items", body));

    ids[key] = saved.item.id;
  });

  return ids;
}

async function until(done: () => Promise<boolean>, deadline: number, what: string): Promise<void> {
  if (await done()) return;
  if (Date.now() > deadline) throw new Error(`${what} were not ready in time.`);
  await delay(POLL_MS);
  await until(done, deadline, what);
}

async function itemsReady(instance: Readonly<Instance>, ids: Ids): Promise<boolean> {
  const states = await Promise.all(
    Object.values(ids).map(
      async (id) =>
        DetailSchema.parse(await instance.send("GET", `/api/items/${String(id)}`)).item.status,
    ),
  );

  return states.every((state) => state === "ready");
}

async function overviewsWritten(instance: Readonly<Instance>): Promise<boolean> {
  const topics = [...new Set(ITEMS.map(({ digest }) => catalogKey(digest.topic)))];
  const pages = await Promise.all(
    topics.map(async (key) =>
      TopicSchema.parse(await instance.send("GET", `/api/topics/${encodeURIComponent(key)}`)),
    ),
  );

  return pages.every(
    ({ topic, overview }) =>
      overview.state === "idle" && overview.text !== null && overview.builtFrom === topic.itemCount,
  );
}

async function relatedPicked(instance: Readonly<Instance>, ids: Ids): Promise<boolean> {
  const [, ...laterItems] = ITEMS;
  const picks = await Promise.all(
    laterItems.map(
      async ({ key }) =>
        DetailSchema.parse(await instance.send("GET", `/api/items/${String(ids[key])}`)).item
          .related,
    ),
  );

  return picks.every((related) => related.length > 0);
}

export async function seedLibrary(
  rig: Readonly<Rig>,
  instance: Readonly<Instance>,
  stub: Readonly<StubProvider>,
): Promise<Ids> {
  await instance.send("PUT", "/api/settings/ai", {
    provider: "openai-compatible",
    baseUrl: stub.baseUrl,
    model: "stub",
    key: "stub",
  });
  const ids = await pasteAll(rig, instance);
  const deadline = Date.now() + WIKI_WAIT_MS;

  await until(() => itemsReady(instance, ids), deadline, "The seeded Items");
  await sequence(
    ITEMS.filter(({ read }) => read === true),
    async ({ key }) => {
      await instance.send("PUT", `/api/items/${String(ids[key])}/read-state`, {
        readState: "read",
      });
    },
  );
  await sequence([...NOTES], async ([key, body]) => {
    await instance.send("PUT", `/api/items/${String(ids[key])}/note`, { body, revision: 0 });
  });
  await until(() => overviewsWritten(instance), deadline, "The Topic overviews");
  await until(() => relatedPicked(instance, ids), deadline, "The Related Items");

  return ids;
}
