import { DatabaseSync } from "node:sqlite";
import { mock } from "node:test";

import { z } from "zod";

import { CreatedTokenResponseSchema, TokenListResponseSchema } from "../src/http/schemas.ts";
import type { Instance, Json } from "./instance.ts";

const FIRST_STATUS = 5_000_000_000;

export const xLink = (number: number): string =>
  `https://x.com/someone/status/${String(FIRST_STATUS + number)}`;

export interface BudgetToken {
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

const TotalSchema = z.object({ total: z.number() });

export function rows(instance: Instance, query: string): readonly unknown[] {
  const database = new DatabaseSync(instance.databaseFile, { readOnly: true });

  try {
    return database.prepare(query).all();
  } finally {
    database.close();
  }
}

export function total(instance: Instance, table: string): number {
  return TotalSchema.parse(rows(instance, `select count(*) as total from ${table}`)[0]).total;
}

export function execute(instance: Instance, statement: string): void {
  const database = new DatabaseSync(instance.databaseFile);

  try {
    database.exec(statement);
  } finally {
    database.close();
  }
}

export const dayOf = (instant: number): string => new Date(instant).toISOString().slice(0, 10);

export function nextMidnight(now: number): number {
  const day = new Date(now);

  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1);
}

export function secondsUntilMidnight(now: number): number {
  return Math.ceil((nextMidnight(now) - now) / 1000);
}

export async function atClock<Result>(
  clock: () => number,
  run: () => Promise<Result>,
): Promise<Result> {
  const driven = mock.method(Date, "now", clock);

  try {
    return await run();
  } finally {
    driven.mock.restore();
  }
}

export function steppingClock(start: number): () => number {
  let calls = 0;

  return () => start + calls++;
}

export function itemsCounted(
  instance: Instance,
  tokenId: number,
): readonly (readonly [string, number])[] {
  return z
    .array(z.object({ day: z.string(), added: z.number() }))
    .parse(
      rows(
        instance,
        `select day, added from agent_token_days where token_id = ${String(tokenId)} order by day`,
      ),
    )
    .map(({ day, added }) => [day, added] as const);
}

export function itemsSavedByDay(
  instance: Instance,
  tokenId: number,
): readonly (readonly [string, number])[] {
  return z
    .array(z.object({ day: z.string(), saved: z.number() }))
    .parse(
      rows(
        instance,
        `select date(saved_at / 1000, 'unixepoch') as day, count(*) as saved from items where added_by_token = ${String(tokenId)} group by day order by day`,
      ),
    )
    .map(({ day, saved }) => [day, saved] as const);
}
