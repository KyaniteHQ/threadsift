import { and, desc, eq, isNull, lte, or } from "drizzle-orm";

import {
  ScopeListSchema,
  type Scope,
  type TokenBudget,
  DEFAULT_TOKEN_BUDGET,
} from "../../../core/contract/agent-token-contract.ts";
import { digestOf, randomSecret } from "../../../core/contract/encoding.ts";
import { report } from "../../../core/kernel/failure-log.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { type AgentTokenRow, agentTokens } from "../../../core/kernel/schema.ts";
import { budgetOf, tokenItemsToday } from "./agent-token-budget.ts";

const TOKEN_BYTES = 32;
const TOKEN_PREFIX = "tsa_";
const LAST_USE_STEP_MS = 3_600_000;

type TokenSummary = Omit<AgentTokenRow, "digest" | "scopes" | "dailyBudget"> & {
  readonly scopes: readonly Scope[];
  readonly budget: TokenBudget;
};

const summary = {
  id: agentTokens.id,
  name: agentTokens.name,
  createdAt: agentTokens.createdAt,
  lastUsedAt: agentTokens.lastUsedAt,
  scopes: agentTokens.scopes,
  dailyBudget: agentTokens.dailyBudget,
};

type SummaryRow = Omit<AgentTokenRow, "digest"> & { readonly added: number };

function scopesOf(tokenId: number, stored: AgentTokenRow["scopes"]): readonly Scope[] {
  const scopes = parsedJson(ScopeListSchema, stored);

  if (scopes !== null) return scopes;

  report("token-scopes-unreadable", { tokenId });

  return [];
}

function summaryOf(
  { dailyBudget, added, ...row }: Readonly<SummaryRow>,
  now: number,
): TokenSummary {
  return {
    ...row,
    scopes: scopesOf(row.id, row.scopes),
    budget: budgetOf(dailyBudget, added, now),
  };
}

function summaries(ports: Ports, now: number) {
  return ports.db
    .select({ ...summary, added: tokenItemsToday(ports.db, agentTokens.id, now) })
    .from(agentTokens);
}

export async function createToken(
  ports: Ports,
  name: string,
  scopes: readonly Scope[],
  dailyBudget: number | null = DEFAULT_TOKEN_BUDGET,
): Promise<{ readonly token: TokenSummary; readonly value: string }> {
  const value = `${TOKEN_PREFIX}${randomSecret(ports.crypto, TOKEN_BYTES)}`;

  const [token] = await ports.db
    .insert(agentTokens)
    .values({
      name,
      digest: digestOf(ports.crypto, value),
      createdAt: Date.now(),
      scopes: JSON.stringify([...new Set(scopes)]),
      dailyBudget,
    })
    .returning(summary);

  if (token === undefined) {
    throw new Error("The agent token was not stored");
  }

  return { token: summaryOf({ ...token, added: 0 }, Date.now()), value };
}

export async function listTokens(ports: Ports): Promise<TokenSummary[]> {
  const now = Date.now();

  const rows = await summaries(ports, now).orderBy(
    desc(agentTokens.createdAt),
    desc(agentTokens.id),
  );

  return rows.map((row) => summaryOf(row, now));
}

export async function changeBudget(
  ports: Ports,
  id: number,
  dailyBudget: number | null,
): Promise<TokenSummary | undefined> {
  const now = Date.now();

  const changed = await ports.db
    .update(agentTokens)
    .set({ dailyBudget })
    .where(eq(agentTokens.id, id))
    .returning({ id: agentTokens.id });

  if (changed.length === 0) return undefined;

  const [row] = await summaries(ports, now).where(eq(agentTokens.id, id));

  return row === undefined ? undefined : summaryOf(row, now);
}

export async function revokeToken(ports: Ports, id: number): Promise<boolean> {
  const revoked = await ports.db
    .delete(agentTokens)
    .where(eq(agentTokens.id, id))
    .returning({ id: agentTokens.id });

  return revoked.length > 0;
}

export interface VerifiedToken {
  readonly id: number;
  readonly name: string;
  readonly scopes: readonly Scope[];
}

export async function verifyToken(ports: Ports, value: string): Promise<VerifiedToken | undefined> {
  const now = Date.now();
  const staleBefore = now - LAST_USE_STEP_MS;

  const [row] = await ports.db
    .select({
      id: agentTokens.id,
      name: agentTokens.name,
      scopes: agentTokens.scopes,
      lastUsedAt: agentTokens.lastUsedAt,
    })
    .from(agentTokens)
    .where(eq(agentTokens.digest, digestOf(ports.crypto, value)));

  if (row === undefined) {
    return undefined;
  }

  if (row.lastUsedAt === null || row.lastUsedAt <= staleBefore) {
    await ports.db
      .update(agentTokens)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(agentTokens.id, row.id),
          or(isNull(agentTokens.lastUsedAt), lte(agentTokens.lastUsedAt, staleBefore)),
        ),
      );
  }

  return { id: row.id, name: row.name, scopes: scopesOf(row.id, row.scopes) };
}
