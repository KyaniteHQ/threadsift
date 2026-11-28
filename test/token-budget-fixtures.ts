import { is } from "drizzle-orm";
import { SQLiteInsertBase } from "drizzle-orm/sqlite-core";
import { z } from "zod";

import {
  CreatedTokenResponseSchema,
  TokenListResponseSchema,
} from "../src/core/contract/access-wire.ts";
import { parseLink } from "../src/core/contract/links.ts";
import { saveUnresolved } from "../src/features/paste/core/item-save.ts";
import type { Instance, Json } from "./instance.ts";

const FIRST_STATUS = 5_000_000_000;

export const xLink = (number: number): string =>
  `https://x.com/someone/status/${String(FIRST_STATUS + number)}`;

interface BudgetToken {
  readonly id: number;
  readonly value: string;
}

export async function makeToken(
  instance: Instance,
  dailyBudget: number | null,
  name = "budget agent",
  scopes: readonly string[] = ["read", "add"],
): Promise<BudgetToken> {
  const { token, value } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
    name,
    scopes: [...scopes],
    dailyBudget,
  });

  return { id: token.id, value };
}

export async function budgetOf(instance: Instance, id: number) {
  const { tokens } = await instance.read("GET", "/api/tokens", TokenListResponseSchema);
  const found = tokens.find((token) => token.id === id);

  if (found === undefined) throw new Error(`token ${String(id)} is not listed`);

  return found.budget;
}

export const addLink = (
  instance: Instance,
  token: BudgetToken,
  number: number,
  extra: Readonly<Record<string, Json>> = {},
) => instance.sendWithToken(token.value, "POST", "/api/items", { url: xLink(number), ...extra });

export const addBatch = (instance: Instance, token: BudgetToken, numbers: readonly number[]) =>
  instance.sendWithToken(token.value, "POST", "/api/items/batch", {
    links: numbers.map((number) => ({ url: xLink(number) })),
  });

export const dayOf = (instant: number): string => new Date(instant).toISOString().slice(0, 10);

export function nextMidnight(now: number): number {
  const day = new Date(now);

  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1);
}

export function secondsUntilMidnight(now: number): number {
  return Math.ceil((nextMidnight(now) - now) / 1000);
}

export function itemsSavedByDay(
  instance: Instance,
  tokenId: number,
): readonly (readonly [string, number])[] {
  return instance.database
    .rows(
      z.object({ day: z.string(), saved: z.number() }),
      "select date(saved_at / 1000, 'unixepoch') as day, count(*) as saved from items where added_by_token = ? group by day order by day",
      tokenId,
    )
    .map(({ day, saved }) => [day, saved] as const);
}

const ITEM_INSERT = /insert into "items"/u;

export function beforeItemInsertBatch(instance: Instance, staged: () => Promise<void>): void {
  const { db } = instance.core;
  const real = db.batch.bind(db);

  Object.defineProperty(db, "batch", {
    configurable: true,
    value: async (queries: Parameters<typeof real>[0]) => {
      if (
        queries.some((query) => is(query, SQLiteInsertBase) && ITEM_INSERT.test(query.toSQL().sql))
      ) {
        Reflect.deleteProperty(db, "batch");
        await staged();
      }

      return real(queries);
    },
  });
}

export const savedUnresolved = (instance: Instance, address: string, addedByToken: number | null) =>
  saveUnresolved(instance.core, {
    paste: { address, addedByToken },
    link: parseLink(address),
    fetched: { status: "unresolved" },
    existing: "refresh",
  });
