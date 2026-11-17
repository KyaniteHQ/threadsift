import { eq, sql } from "drizzle-orm";

import { hex } from "./encoding.ts";
import type { JobPorts } from "./job-outcome.ts";
import { VaultItemFailure } from "./vault-queue.ts";
import type { vaultRequest } from "./vault-request.ts";
import { mirrorBlobs, vaultSettings } from "./vault-tables.ts";
import { VaultShaSchema } from "./vault-tree.ts";

export interface VaultBinary {
  readonly kind: "binary";
  readonly key: string;
  readonly size: number;
  readonly subjectId: number;
  readonly path: string;
}

function encoded(bytes: Uint8Array): string {
  let text = "";
  for (let at = 0; at < bytes.length; at += 32_768)
    text += String.fromCodePoint(...bytes.subarray(at, at + 32_768));
  return btoa(text);
}

async function bytesOf(
  ports: JobPorts,
  file: VaultBinary,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  signal.throwIfAborted();
  const stream = await ports.files.get(file.key);
  if (stream === null)
    throw new VaultItemFailure({ subjectId: file.subjectId, reason: "file-missing" });
  const bytes = new Uint8Array(file.size);
  let offset = 0;
  for await (const chunk of stream) {
    signal.throwIfAborted();
    if (offset + chunk.length > file.size)
      throw new VaultItemFailure({ subjectId: file.subjectId, reason: "file-changed" });
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== file.size)
    throw new VaultItemFailure({ subjectId: file.subjectId, reason: "file-changed" });
  return bytes;
}

export async function vaultBlob(
  input: Readonly<{
    ports: JobPorts;
    request: Readonly<ReturnType<typeof vaultRequest>>;
    file: VaultBinary;
    sealedToken: string;
    signal: AbortSignal;
  }>,
): Promise<string> {
  const { ports, request, file, sealedToken, signal } = input;
  const bytes = await bytesOf(ports, file, signal);
  const digest = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  const [cached] = await ports.db.select().from(mirrorBlobs).where(eq(mirrorBlobs.digest, digest));
  if (cached !== undefined) return cached.sha;
  const { sha } = await request.mutate({
    method: "post",
    path: "/git/blobs",
    schema: VaultShaSchema,
    body: JSON.stringify({ content: encoded(bytes), encoding: "base64" }),
    current: null,
  });
  await ports.db
    .insert(mirrorBlobs)
    .select(
      ports.db
        .select({ digest: sql<string>`${digest}`.as("digest"), sha: sql<string>`${sha}`.as("sha") })
        .from(sql`(select 1)`)
        .where(
          sql`exists (select 1 from ${vaultSettings} where ${vaultSettings.sealedToken} = ${sealedToken})`,
        ),
    )
    .onConflictDoNothing();
  return sha;
}
