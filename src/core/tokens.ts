import { and, desc, eq, getTableColumns, isNull, lte, or } from "drizzle-orm";

import { digestOf, randomSecret } from "./encoding.ts";
import type { Ports } from "./ports.ts";
import { type AgentTokenRow, agentTokens } from "./schema.ts";

const TOKEN_BYTES = 32;
const TOKEN_PREFIX = "tsa_";
const LAST_USE_STEP_MS = 3_600_000;

export type TokenSummary = Omit<AgentTokenRow, "digest">;

const { digest: _digest, ...summary } = getTableColumns(agentTokens);

export async function createToken(
  ports: Ports,
  name: string,
): Promise<{ readonly token: TokenSummary; readonly value: string }> {
  const value = `${TOKEN_PREFIX}${randomSecret(ports.crypto, TOKEN_BYTES)}`;

  const [token] = await ports.db
    .insert(agentTokens)
    .values({ name, digest: digestOf(ports.crypto, value), createdAt: Date.now() })
    .returning(summary);

  if (token === undefined) {
    throw new Error("The agent token was not stored");
  }

  return { token, value };
}

export function listTokens(ports: Ports): Promise<TokenSummary[]> {
  return ports.db
    .select(summary)
    .from(agentTokens)
    .orderBy(desc(agentTokens.createdAt), desc(agentTokens.id));
}

export async function revokeToken(ports: Ports, id: number): Promise<boolean> {
  const revoked = await ports.db
    .delete(agentTokens)
    .where(eq(agentTokens.id, id))
    .returning({ id: agentTokens.id });

  return revoked.length > 0;
}

export async function tokenIsValid(ports: Ports, value: string): Promise<boolean> {
  const now = Date.now();
  const staleBefore = now - LAST_USE_STEP_MS;

  const [row] = await ports.db
    .select({ id: agentTokens.id, lastUsedAt: agentTokens.lastUsedAt })
    .from(agentTokens)
    .where(eq(agentTokens.digest, digestOf(ports.crypto, value)));

  if (row === undefined) {
    return false;
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

  return true;
}
