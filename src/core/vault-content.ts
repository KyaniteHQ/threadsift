import { hex } from "./encoding.ts";
import type { JobPorts } from "./job-outcome.ts";
import type { VaultFile } from "./vault-github.ts";
import { VaultNoteFailure } from "./vault-queue.ts";

export function base64VaultBytes(bytes: Uint8Array): string {
  let text = "";
  for (let at = 0; at < bytes.length; at += 32_768)
    text += String.fromCodePoint(...bytes.subarray(at, at + 32_768));
  return btoa(text);
}

export async function vaultContent({
  ports,
  file,
  signal,
}: Readonly<{
  ports: JobPorts;
  file: Readonly<Exclude<VaultFile, { kind: "delete" }>>;
  signal: AbortSignal;
}>): Promise<Uint8Array> {
  signal.throwIfAborted();
  if (file.kind === "memory") return file.bytes;
  const stream = await ports.files.get(file.key);
  if (stream === null) throw new VaultNoteFailure("file-missing");
  const bytes = new Uint8Array(file.size);
  let offset = 0;
  for await (const chunk of stream) {
    signal.throwIfAborted();
    if (offset + chunk.length > file.size) throw new VaultNoteFailure("file-changed");
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== file.size) throw new VaultNoteFailure("file-changed");
  return bytes;
}

export async function vaultContentSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${String(bytes.length)}\0`);
  const input = new Uint8Array(header.length + bytes.length);
  input.set(header);
  input.set(bytes, header.length);
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-1", input)));
}
