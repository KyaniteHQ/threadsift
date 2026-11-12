import { and, desc, eq, getTableColumns, isNull, lte, or } from "drizzle-orm";

import { digestOf, randomSecret } from "./encoding.ts";
import { ScopeListSchema, type Scope } from "./kinds.ts";
import type { Ports } from "./ports.ts";
import { type AgentTokenRow, agentTokens } from "./schema.ts";

const TOKEN_BYTES = 32;
const TOKEN_PREFIX = "tsa_";
const LAST_USE_STEP_MS = 3_600_000;

export type TokenSummary = Omit<AgentTokenRow, "digest" | "scopes"> & {
  readonly scopes: readonly Scope[];
};

const { digest: _digest, ...summary } = getTableColumns(agentTokens);

function summaryOf(row: Readonly<Omit<AgentTokenRow, "digest">>): TokenSummary {
  const scopes = ScopeListSchema.safeParse(row.scopes);

  return { ...row, scopes: scopes.success ? scopes.data : [] };
}

export async function createToken(
  ports: Ports,
  name: string,
  scopes: readonly Scope[],
): Promise<{ readonly token: TokenSummary; readonly value: string }> {
  const value = `${TOKEN_PREFIX}${randomSecret(ports.crypto, TOKEN_BYTES)}`;

  const [token] = await ports.db
    .insert(agentTokens)
    .values({
      name,
      digest: digestOf(ports.crypto, value),
      createdAt: Date.now(),
      scopes: [...new Set(scopes)],
    })
    .returning(summary);

  if (token === undefined) {
    throw new Error("The agent token was not stored");
  }

  return { token: summaryOf(token), value };
}

export async function listTokens(ports: Ports): Promise<TokenSummary[]> {
  const rows = await ports.db
    .select(summary)
    .from(agentTokens)
    .orderBy(desc(agentTokens.createdAt), desc(agentTokens.id));

  return rows.map((row) => summaryOf(row));
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

  return { id: row.id, name: row.name, scopes: ScopeListSchema.parse(row.scopes) };
}
