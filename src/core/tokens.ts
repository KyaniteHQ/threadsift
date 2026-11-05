import { and, desc, eq, isNull, lte, or } from "drizzle-orm";

import { base64url, hex } from "./encoding.ts";
import type { Ports } from "./ports.ts";
import { type AgentTokenRow, agentTokens } from "./schema.ts";

const TOKEN_BYTES = 32;
const TOKEN_PREFIX = "tsa_";
const LAST_USE_STEP_MS = 3_600_000;

export type TokenSummary = Omit<AgentTokenRow, "digest">;

const summary = {
  id: agentTokens.id,
  name: agentTokens.name,
  createdAt: agentTokens.createdAt,
  lastUsedAt: agentTokens.lastUsedAt,
};

export async function createToken(
  ports: Ports,
  name: string,
): Promise<{ readonly token: TokenSummary; readonly value: string }> {
  const value = `${TOKEN_PREFIX}${base64url(ports.crypto.randomBytes(TOKEN_BYTES))}`;

  const [token] = await ports.db
    .insert(agentTokens)
    .values({ name, digest: hex(ports.crypto.sha256(value)), createdAt: Date.now() })
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
  const digest = hex(ports.crypto.sha256(value));

  const [row] = await ports.db
    .select(summary)
    .from(agentTokens)
    .where(eq(agentTokens.digest, digest));

  if (row === undefined) {
    return false;
  }

  await ports.db
    .update(agentTokens)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(agentTokens.id, row.id),
        or(isNull(agentTokens.lastUsedAt), lte(agentTokens.lastUsedAt, now - LAST_USE_STEP_MS)),
      ),
    );

  return true;
}
