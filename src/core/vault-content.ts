import { readExactly } from "./capped.ts";
import type { JobPorts } from "./job-outcome.ts";
import { VaultNoteFailure } from "./vault-note-failure.ts";
import type { VaultFile } from "./vault-target.ts";

async function* unlessAborted(
  body: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<Uint8Array> {
  for await (const chunk of body) {
    signal.throwIfAborted();
    yield chunk;
  }
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
  const bytes = await readExactly(unlessAborted(stream, signal), file.size);
  if (bytes === null) throw new VaultNoteFailure("file-changed");
  return bytes;
}
