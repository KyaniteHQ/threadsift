import { and, desc, eq, getTableColumns, isNull, lte, or, sql } from "drizzle-orm";

import { budgetOf, forgetOldDays, utcDay } from "./agent-token-budget.ts";
import { digestOf, randomSecret } from "./encoding.ts";
import { ScopeListSchema, type Scope, type TokenBudget } from "./kinds.ts";
import { DEFAULT_TOKEN_BUDGET } from "./limits.ts";
import type { Ports } from "./ports.ts";
import { type AgentTokenRow, agentTokenDays, agentTokens } from "./schema.ts";

const TOKEN_BYTES = 32;
const TOKEN_PREFIX = "tsa_";
const LAST_USE_STEP_MS = 3_600_000;

export type TokenSummary = Omit<AgentTokenRow, "digest" | "scopes" | "dailyBudget"> & {
  readonly scopes: readonly Scope[];
  readonly budget: TokenBudget;
};

const { digest: _digest, ...summary } = getTableColumns(agentTokens);

type SummaryRow = Omit<AgentTokenRow, "digest"> & { readonly added: number };

function summaryOf(
  { dailyBudget, added, ...row }: Readonly<SummaryRow>,
  now: number,
): TokenSummary {
  const scopes = ScopeListSchema.safeParse(row.scopes);

  return {
    ...row,
    scopes: scopes.success ? scopes.data : [],
    budget: budgetOf(dailyBudget, added, now),
  };
}

function summaries(ports: Ports, now: number) {
  return ports.db
    .select({ ...summary, added: sql<number>`coalesce(${agentTokenDays.added}, 0)` })
    .from(agentTokens)
    .leftJoin(
      agentTokenDays,
      and(eq(agentTokenDays.tokenId, agentTokens.id), eq(agentTokenDays.day, utcDay(now))),
    );
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
      scopes: [...new Set(scopes)],
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

    await forgetOldDays(ports.db, row.id, now);
  }

  return { id: row.id, name: row.name, scopes: ScopeListSchema.parse(row.scopes) };
}
