import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

import type { Instance } from "./instance.ts";
import { ARTICLE_ITEMS, NOTES } from "./library-articles.ts";
import { REDDIT_ITEMS } from "./library-reddit.ts";
import { X_ITEMS } from "./library-x.ts";
import { picture } from "./pictures.ts";
import type { SeedItem } from "./seed-types.ts";
import { sequence } from "./sequence.ts";
import type { StubProvider } from "./stub-provider.ts";

const READY_WAIT_MS = 120_000;

const POLL_MS = 500;

const QUIET_MS = 3000;

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

export type Ids = Readonly<Record<string, number>>;

async function pasteAll(instance: Readonly<Instance>): Promise<Ids> {
  const ids: Record<string, number> = {};

  await sequence(ITEMS, async ({ key, url, content, page, digest, accent }, index) => {
    const art =
      accent === undefined
        ? ""
        : `![${page?.title ?? ""}](${await picture(accent, index % 4)})\n\n`;
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

async function allReady(instance: Readonly<Instance>, ids: Ids, deadline: number): Promise<void> {
  const states = await Promise.all(
    Object.values(ids).map(
      async (id) =>
        ItemSchema.parse(await instance.send("GET", `/api/items/${String(id)}`)).item.status,
    ),
  );

  if (states.every((state) => state === "ready")) return;
  if (Date.now() > deadline) throw new Error("The seeded Items were not ready in time.");
  await delay(POLL_MS);
  await allReady(instance, ids, deadline);
}

async function quiet(
  stub: Readonly<StubProvider>,
  lastCalls: number,
  since: number,
): Promise<void> {
  const calls = stub.calls();

  if (calls === lastCalls && Date.now() - since > QUIET_MS) return;
  await delay(POLL_MS);
  await quiet(stub, calls, calls === lastCalls ? since : Date.now());
}

export async function seedLibrary(
  instance: Readonly<Instance>,
  stub: Readonly<StubProvider>,
): Promise<Ids> {
  await instance.send("PUT", "/api/settings/ai", {
    provider: "openai-compatible",
    baseUrl: stub.baseUrl,
    model: "stub",
    key: "stub",
  });
  const ids = await pasteAll(instance);

  await allReady(instance, ids, Date.now() + READY_WAIT_MS);
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
  await quiet(stub, -1, Date.now());

  return ids;
}
