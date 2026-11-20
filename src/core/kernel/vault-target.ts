import { hex } from "../contract/encoding.ts";
import type { VaultKind, VaultSubject } from "./vault-tables.ts";

export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${String(bytes.length)}\0`);
  const input = new Uint8Array(header.length + bytes.length);
  input.set(header);
  input.set(bytes, header.length);
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-1", input)));
}

export type VaultFile = Readonly<{ path: string }> &
  (
    | Readonly<{ kind: "binary"; key: string; size: number }>
    | Readonly<{ kind: "memory"; bytes: Uint8Array }>
    | Readonly<{ kind: "delete" }>
  );

export function vaultFileSize(file: VaultFile): number {
  return file.kind === "delete" ? 0 : file.kind === "binary" ? file.size : file.bytes.length;
}

export interface VaultProgress {
  readonly path: string;
  readonly subjectId: number;
  readonly noteKind: VaultKind;
  readonly sequence: number;
  readonly sha: string | null;
}

export type VaultChange = VaultProgress &
  (Readonly<{ kind: "put"; bytes: Uint8Array }> | Readonly<{ kind: "delete" }>);

export interface VaultWrite {
  readonly files: readonly VaultChange[];
  readonly current: () => Promise<boolean>;
}

export interface VaultTarget {
  readonly verify: () => Promise<void>;
  readonly subjects: () => Promise<readonly VaultSubject[]>;
  readonly logMonths: () => Promise<readonly number[]>;
  readonly files: (
    subject: VaultSubject,
  ) => Promise<readonly Readonly<{ path: string; sha: string }>[]>;
  readonly write: (operation: Readonly<VaultWrite>) => Promise<void>;
}

export type VaultFolder = (path: string, signal: AbortSignal) => VaultTarget;

export class VaultFileConflict extends Error {
  readonly file: Readonly<VaultChange>;

  constructor(file: Readonly<VaultChange>) {
    super("folder-conflict");
    this.file = file;
  }
}
