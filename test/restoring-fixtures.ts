import { DatabaseSync } from "node:sqlite";

import { ItemReadResponseSchema } from "../src/core/contract/item-route-wire.ts";
import { parseLink } from "../src/core/contract/links.ts";
import { whileOpen } from "../src/core/kernel/restore-hold.ts";
import { saveUnresolved } from "../src/features/paste/core/item-save.ts";
import type { Answer, Instance } from "./instance.ts";
import { addressOf, threadOf } from "./reader-thread-fixtures.ts";

const xLink = (id: number): string => `https://x.com/someone/status/${String(id)}`;

export function holdLibrary(
  instance: Instance,
  state: "running" | "failed",
  failure: "gave-up" | "no-manifest" | null,
): void {
  const database = new DatabaseSync(instance.databaseFile);

  database.exec("delete from restores");
  database
    .prepare(
      "insert into restores (state, phase, failure, bytes, parts, part_bytes, created_at, updated_at) values (?, 'tables', ?, 1, 1, 1, 1, 1)",
    )
    .run(state, failure);
  database.close();
}

export async function itemTotal(instance: Instance): Promise<number> {
  return (await instance.read("GET", "/api/items", ItemReadResponseSchema)).counts?.total ?? -1;
}

export async function pasteThroughEveryDoor(
  instance: Instance,
  agentToken: string,
  knownLink: string,
): Promise<readonly Answer[]> {
  const page = { markdown: "A page.", title: "A page" };

  return [
    await instance.send("POST", "/api/items", { url: xLink(3600000001) }),
    await instance.send("POST", "/api/items", { url: "https://held.test/page", page }),
    await instance.send("POST", "/api/items", { url: addressOf("held2"), page }),
    await instance.send("POST", "/api/items", {
      url: addressOf("held3"),
      content: threadOf("held3"),
    }),
    await instance.sendWithToken(agentToken, "POST", "/api/items", { url: xLink(3600000002) }),
    await instance.send("POST", "/api/items/batch", {
      links: [{ url: xLink(3600000003) }, { url: xLink(3600000004) }],
    }),
    await instance.send("POST", "/api/items/batch", { links: [{ url: knownLink }] }),
  ];
}

export function pasteFailedShortLink(instance: Instance) {
  const short = "https://t.co/heldfailure";

  return whileOpen(instance.core.db, () =>
    saveUnresolved(instance.core, {
      paste: { address: short, addedByToken: null },
      link: parseLink(short),
      fetched: { status: "unresolved" },
      existing: "refresh",
    }),
  );
}
